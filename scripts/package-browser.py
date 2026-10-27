"""Create a self-contained hosting handoff. Packaging tool only, not an app dependency."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parent.parent
out = root / 'release'
out.mkdir(exist_ok=True)
target = out / 'bide-browser.zip'
for required in ['index.html', 'ocr/worker.min.js', 'ocr/lang/eng.traineddata.gz','ocr/lang/fra.traineddata.gz', 'office/runtime/soffice.wasm', 'diagrams/runtime/index.html', 'diagrams/runtime/js/app.min.js', 'licenses/drawio-LICENSE.txt', 'ai/models/lama.onnx', 'ai/models/realesr-general-x4v3.onnx', 'ai/models/ppocr-det.onnx', 'ai/models/ppocr-latin-rec.onnx', 'ai/ort/ort-wasm-simd-threaded.jsep.wasm']:
    if not (root / 'dist' / required).is_file(): raise SystemExit(f'Missing built asset: {required}. Build before packaging.')
manifest = json.loads((root / 'public/ai/manifest.json').read_text(encoding='utf-8'))
required_assets = ['brand-logo.svg', 'favicon.svg']
required_assets += ['ai/models/' + name for name in manifest['files']]
required_assets += [f'ai/models/ppocr-{script}-dict.json' for script in ['latin','cyrillic','greek','arabic','korean','cjk']]
required_assets += [f'ocr/spell/{language}.{ext}' for language in ['en','fr'] for ext in ['aff','dic']]
required_assets += [f'ocr/lang/{language}.traineddata.gz' for language in ['eng','fra','deu','spa','ita','nld','por']]
for required in required_assets:
    if not (root / 'dist' / required).is_file(): raise SystemExit(f'Missing built asset: {required}. Build before packaging.')
with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for name in ['Install Dependencies.bat', 'launch bide.bat', 'share bide.bat', 'Stop bide.bat', 'Setup.cmd', 'start bide.cmd', 'lan-settings.example.json']:
        archive.write(root / name, name)
        archive.write(root / name, 'source/' + name)
    for name in ['windows.mjs', 'bide.cmd', 'serve.mjs', 'server-control.mjs']:
        archive.write(root / 'scripts' / name, 'scripts/' + name)
    archive.writestr('START HERE.txt', 'Extract this entire ZIP into a NEW writable local folder. The site folder must be beside the BAT files.\r\n1. Use your installed Node.js 22 or newer. Detected on PATH or in C:\\devhome\\tools\\node24\\current (no Node download).\r\n2. Double-click launch bide.bat to open the editor locally.\r\n3. To share internally, double-click share bide.bat and give colleagues the displayed IP:8786 address. Keep the sharing window open.\r\n4. Double-click Stop bide.bat to stop local and shared servers started by this version from this folder. Save your work first. Other Node applications are unaffected.\r\nColleagues only need a browser. Each visitor has their own local workspace.\r\nUse trusted HTTPS for Office conversion on other PCs and reliable downloads; see HOSTING.md for setup.\r\nInstall Dependencies.bat is optional for this prebuilt ZIP: it only checks local files, with no downloads. PowerShell, Python, installed Office and execution-policy changes are not required.\r\nKeep the scripts and site folders beside the BAT files.\r\nUse the BAT files beside site to run offline. The source folder is for developers and rebuilding may download npm packages.\r\n')
    for path in (root / 'dist').rglob('*'):
        if path.is_file(): archive.write(path, 'site/' + path.relative_to(root / 'dist').as_posix())
    for folder in ['src', 'scripts', 'tests', 'vendor-source', 'public', 'docs', 'marketing']:
        for path in (root / folder).rglob('*'):
            if 'tests/real/' in path.relative_to(root).as_posix() and path.name not in ['README.md', 'example.json']:
                continue  # User-supplied OCR fixtures never belong in a public release.
            if path.is_file() and '__pycache__' not in path.parts and not any(asset in path.relative_to(root).as_posix() for asset in ['public/ocr/', 'public/office/runtime/', 'public/diagrams/runtime/', 'public/ai/models/', 'public/ai/ort/']):
                archive.write(path, 'source/' + path.relative_to(root).as_posix())
    for name in ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'discovery.config.json', 'index.html', 'README.md', 'HOSTING.md', 'THIRD_PARTY.md', 'FEATURES.md', 'LICENSE', '.gitignore', '.gitattributes', 'server.py', 'requirements.txt', 'requirements.lock.txt', 'pytest.ini']:
        archive.write(root / name, 'source/' + name)
    archive.write(root / 'HOSTING.md', 'HOSTING.md')
    archive.write(root / 'FEATURES.md', 'FEATURES.md')
    archive.write(root / 'LICENSE', 'LICENSE')
    archive.write(root / 'README.md', 'README.md')
    archive.write(root / 'THIRD_PARTY.md', 'THIRD_PARTY.md')
    archive.writestr('source/REBUILD.md', 'Run "Install Dependencies.bat" --build-source to explicitly use your installed Node.js and npm, restore the Office and diagram assets from ../site, install the locked npm dependencies, and build the editor. This source rebuild may need internet; the prebuilt root launchers need no setup downloads. Then run launch bide.bat. For manual builds, run npm ci --ignore-scripts, npm run assets:office, npm run assets:diagrams, and npm run build:local. npm test runs browser PDF engine tests; the Python test file is the older engine reference.\n')
print(f'{target}\n{target.stat().st_size / 1024 / 1024:.1f} MB')
