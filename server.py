"""bide: loopback-only PDF and conversion engine. No cloud services."""
from __future__ import annotations
import base64
import hashlib
import io
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import threading
import zipfile

import pymupdf as fitz
from PIL import Image, ImageOps
from fastapi import FastAPI, File, HTTPException, UploadFile, Request
from fastapi.responses import Response, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
app = FastAPI(title="bide", docs_url=None, redoc_url=None)
SOURCES: dict[str, bytes] = {}
PDF_LOCK = threading.RLock()
MAX_FILE = 150 * 1024 * 1024


@app.middleware("http")
async def local_only(request: Request, call_next):
    # Prevent foreign websites from posting documents to the local service.
    origin = request.headers.get("origin", "")
    if origin and not re.fullmatch(r"https?://(localhost|127\.0\.0\.1)(:\d+)?", origin):
        return JSONResponse({"detail": "Only local requests are allowed."}, status_code=403)
    host = request.headers.get("host", "").split(":")[0]
    if host not in {"localhost", "127.0.0.1", "testserver"}:
        return JSONResponse({"detail": "Invalid local host."}, status_code=403)
    return await call_next(request)


def libreoffice() -> str | None:
    candidates = [os.environ.get("BIDE_SOFFICE"), shutil.which("soffice"),
                  r"C:\Program Files\LibreOffice\program\soffice.exe",
                  r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"]
    return next((p for p in candidates if p and Path(p).is_file()), None)


def open_pdf(data: bytes):
    try:
        doc = fitz.open(stream=data, filetype="pdf")
        if doc.needs_pass:
            doc.close()
            raise HTTPException(422, "This PDF is password protected. Unlock it before importing.")
        if not len(doc):
            doc.close()
            raise HTTPException(422, "This PDF has no pages.")
        return doc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, "The file could not be read as a PDF.") from exc


def pdf_bytes(doc):
    return doc.tobytes(garbage=4, deflate=True, deflate_images=True, deflate_fonts=True)


def convert_input(data: bytes, name: str) -> bytes:
    ext = Path(name).suffix.lower()
    if ext == ".pdf":
        with open_pdf(data):
            return data
    if ext in {".doc", ".docx", ".odt", ".rtf", ".xls", ".xlsx", ".ods", ".ppt", ".pptx", ".odp"}:
        exe = libreoffice()
        if not exe:
            raise HTTPException(422, "Office conversion needs LibreOffice. Install LibreOffice, then restart bide.")
        with tempfile.TemporaryDirectory(prefix="bide-office-") as folder:
            work = Path(folder)
            src = work / ("document" + ext)
            src.write_bytes(data)
            profile = (work / "profile").as_uri()
            try:
                result = subprocess.run([exe, f"-env:UserInstallation={profile}", "--headless",
                                         "--convert-to", "pdf", "--outdir", str(work), str(src)],
                                        capture_output=True, timeout=120,
                                        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            except subprocess.TimeoutExpired as exc:
                raise HTTPException(422, "Office conversion timed out. Try a smaller document.") from exc
            output = work / "document.pdf"
            if result.returncode or not output.exists():
                raise HTTPException(422, "LibreOffice could not convert this file.")
            return output.read_bytes()
    if ext in {".txt", ".md"}:
        import html
        text = data.decode("utf-8-sig", errors="replace")
        out = io.BytesIO()
        story = fitz.Story(html="<pre>" + html.escape(text) + "</pre>", user_css="pre {font-family: sans-serif; white-space: pre-wrap; font-size: 11pt;}")
        writer = fitz.DocumentWriter(out)
        rect = fitz.paper_rect("a4")
        more = True
        while more:
            dev = writer.begin_page(rect)
            more, _ = story.place(rect + (40, 40, -40, -40))
            story.draw(dev)
            writer.end_page()
        writer.close()
        return out.getvalue()
    if ext in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}:
        try:
            doc = fitz.open()
            with Image.open(io.BytesIO(data)) as image:
                for frame in range(getattr(image, "n_frames", 1)):
                    image.seek(frame)
                    rgb = ImageOps.exif_transpose(image).convert("RGB")
                    buf = io.BytesIO()
                    rgb.save(buf, "PNG")
                    ratio = min(1, 14400 / max(rgb.size))
                    page = doc.new_page(width=rgb.width * ratio, height=rgb.height * ratio)
                    page.insert_image(page.rect, stream=buf.getvalue())
            result = pdf_bytes(doc)
            doc.close()
            return result
        except Exception as exc:
            raise HTTPException(422, "The image could not be decoded.") from exc
    if ext == ".svg":
        # No network/file references in uploaded SVG.
        check_svg(data.decode("utf-8"))
        with fitz.open(stream=data, filetype="svg") as svg:
            return svg.convert_to_pdf()
    raise HTTPException(422, f"Unsupported format: {ext or 'unknown'}. Use PDF, images, Office documents, TXT, MD, or SVG.")


def register(data: bytes):
    key = hashlib.sha256(data).hexdigest()
    with open_pdf(data) as doc:
        pages = [{"index": i, "width": p.rect.width, "height": p.rect.height} for i, p in enumerate(doc)]
    SOURCES[key] = data
    return {"id": key, "data": base64.b64encode(data).decode(), "pages": pages}


@app.get("/api/health")
def health():
    return {"ok": True, "name": "bide", "office": bool(libreoffice()), "ocr": bool(shutil.which("tesseract"))}


@app.post("/api/import")
def import_document(file: UploadFile = File(...)):
    data = file.file.read(MAX_FILE + 1)
    if len(data) > MAX_FILE:
        raise HTTPException(413, "Maximum file size is 150 MB.")
    with PDF_LOCK:
        return register(convert_input(data, file.filename or "document.pdf"))


@app.post("/api/restore")
def restore(sources: dict[str, str]):
    with PDF_LOCK:
        for key, value in sources.items():
            try:
                data = base64.b64decode(value, validate=True)
            except Exception as exc:
                raise HTTPException(422, "Invalid project document data.") from exc
            if len(data) > MAX_FILE or hashlib.sha256(data).hexdigest() != key:
                raise HTTPException(422, "Project source data is corrupted or too large.")
            with open_pdf(data):
                SOURCES[key] = data
    return {"ok": True}


@app.get("/api/sources/{source}/pages/{index}")
def render_page(source: str, index: int, scale: float = 1.4):
    with PDF_LOCK:
        if source not in SOURCES:
            raise HTTPException(404, "Document not in memory. Reopen your project.")
        with open_pdf(SOURCES[source]) as doc:
            if index < 0 or index >= len(doc):
                raise HTTPException(404, "Page not found.")
            page = doc[index]
            scale = min(max(scale, 0.1), 3, 3500 / max(page.rect.width, page.rect.height))
            pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
            return Response(pix.tobytes("png"), media_type="image/png")


class PageSpec(BaseModel):
    width: float = Field(gt=0, le=14400)
    height: float = Field(gt=0, le=14400)
    source: str | None = None
    index: int = Field(default=0, ge=0)
    svg: str = ""


class ExportSpec(BaseModel):
    pages: list[PageSpec] = Field(min_length=1, max_length=1000)
    title: str = "Untitled"
    format: str = "pdf"
    dpi: int = Field(default=144, ge=72, le=300)
    range: str = ""
    compression: str = "lossless"
    rotation: int = 0


def check_svg(svg: str):
    # XML parser blocks entities and only permits embedded raster assets.
    from defusedxml import ElementTree
    try:
        root = ElementTree.fromstring(svg)
    except Exception as exc:
        raise HTTPException(422, "Invalid SVG artwork.") from exc
    for node in root.iter():
        for attr, value in node.attrib.items():
            if attr.endswith("href") and not value.startswith(("data:image/", "#")):
                raise HTTPException(422, "Artwork must embed images; external references are not supported.")
            if "url(" in value and not re.search(r"url\(['\"]?#", value):
                raise HTTPException(422, "External artwork references are not supported.")


def compose(spec: ExportSpec):
    result = fitz.open()
    for entry in spec.pages:
        if entry.source:
            if entry.source not in SOURCES:
                raise HTTPException(404, "A source PDF is missing. Reopen the project.")
            with open_pdf(SOURCES[entry.source]) as source:
                if entry.index >= len(source):
                    raise HTTPException(422, "Source page does not exist.")
                original = source[entry.index]
                if abs(original.rect.width - entry.width) < 0.01 and abs(original.rect.height - entry.height) < 0.01:
                    result.insert_pdf(source, from_page=entry.index, to_page=entry.index, links=True, annots=True, widgets=True)
                    page = result[-1]
                    # Normalize rotation while preserving the visual appearance and annotations.
                    if page.rotation:
                        page.remove_rotation()
                else:
                    page = result.new_page(width=entry.width, height=entry.height)
                    if source[entry.index].get_contents():
                        page.show_pdf_page(page.rect, source, entry.index, keep_proportion=False)
        else:
            page = result.new_page(width=entry.width, height=entry.height)
        if entry.svg:
            check_svg(entry.svg)
            try:
                with fitz.open(stream=entry.svg.encode(), filetype="svg") as svg:
                    with fitz.open(stream=svg.convert_to_pdf(), filetype="pdf") as overlay:
                        if overlay[0].get_contents():
                            page.show_pdf_page(page.rect, overlay, keep_proportion=False)
            except HTTPException:
                raise
            except Exception as exc:
                raise HTTPException(422, "Could not render the page artwork.") from exc
        if spec.rotation:
            page.set_rotation(spec.rotation % 360)
    result.set_metadata({"title": spec.title, "creator": "bide"})
    return result


def page_range(value: str, count: int) -> list[int]:
    if not value.strip():
        return list(range(count))
    output = []
    try:
        for chunk in value.split(","):
            numbers = [int(x.strip()) for x in chunk.strip().split("-")]
            if len(numbers) == 1:
                output.append(numbers[0] - 1)
            elif len(numbers) == 2 and numbers[0] <= numbers[1]:
                output.extend(range(numbers[0] - 1, numbers[1]))
            else:
                raise ValueError()
        if not output or any(x < 0 or x >= count for x in output):
            raise ValueError()
        return output
    except ValueError as exc:
        raise HTTPException(422, f"Use page numbers from 1 to {count}, for example 1-3, 5.") from exc


def compress_images(doc, preset):
    # Replace only oversized opaque raster images; preserve text/vectors and transparency.
    limit, quality = (1600, 78) if preset == "balanced" else (1000, 58)
    visited = set()
    for page in doc:
        for item in page.get_images(full=True):
            xref, mask = item[:2]
            if xref in visited or mask:
                continue
            visited.add(xref)
            try:
                original = doc.extract_image(xref)["image"]
                with Image.open(io.BytesIO(original)) as image:
                    if max(image.size) < limit and len(original) < 100_000:
                        continue
                    image = image.convert("RGB")
                    image.thumbnail((limit, limit), Image.Resampling.LANCZOS)
                    buf = io.BytesIO()
                    image.save(buf, "JPEG", quality=quality, optimize=True)
                    if len(buf.getvalue()) < len(original):
                        page.replace_image(xref, stream=buf.getvalue())
            except (ValueError, OSError):
                continue


@app.post("/api/export")
def export_document(spec: ExportSpec):
    with PDF_LOCK:
        with compose(spec) as doc:
            selected = page_range(spec.range, len(doc))
            if selected != list(range(len(doc))):
                doc.select(selected)
            if spec.compression not in {"lossless", "balanced", "small"}:
                raise HTTPException(422, "Unknown compression setting.")
            if spec.compression != "lossless":
                compress_images(doc, spec.compression)
            if spec.format == "pdf":
                return Response(pdf_bytes(doc), media_type="application/pdf")
            if spec.format == "txt":
                return Response("\n\n".join(p.get_text() for p in doc), media_type="text/plain; charset=utf-8")
            if spec.format == "docx":
                from docx import Document
                word = Document()
                for i, page in enumerate(doc):
                    if i:
                        word.add_page_break()
                    for block in page.get_text("blocks"):
                        word.add_paragraph(block[4])
                buf = io.BytesIO()
                word.save(buf)
                return Response(buf.getvalue(), media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
            if spec.format in {"png", "jpg", "svg", "split"}:
                buf = io.BytesIO()
                with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as archive:
                    for i, page in enumerate(doc):
                        if spec.format == "split":
                            with fitz.open() as single:
                                single.insert_pdf(doc, from_page=i, to_page=i)
                                data, ext = pdf_bytes(single), "pdf"
                        elif spec.format == "svg":
                            data, ext = page.get_svg_image().encode(), "svg"
                        else:
                            pix = page.get_pixmap(dpi=spec.dpi, alpha=False)
                            data, ext = pix.tobytes(spec.format), spec.format
                        archive.writestr(f"page-{i + 1:03}.{ext}", data)
                return Response(buf.getvalue(), media_type="application/zip")
            raise HTTPException(422, "Unknown export format.")


if (ROOT / "dist").exists():
    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("BIDE_PORT", "8765")))
