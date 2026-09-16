"""Create a self-contained hosting handoff. Packaging tool only, not an app dependency."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
out = root / 'release'
out.mkdir(exist_ok=True)
target = out / 'bide-browser.zip'
with ZipFile(target, 'w', ZIP_DEFLATED, compresslevel=6) as archive:
    for name in ['Install Dependencies.bat', 'launch bide.bat']:
        archive.write(root / name, name)
        archive.write(root / name, 'source/' + name)
    for name in ['windows.ps1', 'serve.mjs']:
        archive.write(root / 'scripts' / name, 'scripts/' + name)
    archive.writestr('START HERE.txt', 'Extract this entire ZIP into a writable local folder.\r\n1. Double-click Install Dependencies.bat once (internet needed for the private Node.js download).\r\n2. Double-click launch bide.bat to open the editor.\r\nNo admin rights, global Node.js, Python, or installed Office are required.\r\nKeep the scripts and site folders beside the BAT files.\r\nThe local launcher works offline after setup.\r\nSee HOSTING.md if you prefer a hosted website.\r\n')
    for path in (root / 'dist').rglob('*'):
        if path.is_file(): archive.write(path, 'site/' + path.relative_to(root / 'dist').as_posix())
    for folder in ['src', 'scripts', 'tests', 'vendor-source', 'public']:
        for path in (root / folder).rglob('*'):
            if path.is_file() and '__pycache__' not in path.parts and 'public/office/runtime/' not in path.relative_to(root).as_posix():
                archive.write(path, 'source/' + path.relative_to(root).as_posix())
    for name in ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html', 'README.md', 'HOSTING.md', 'THIRD_PARTY.md', 'FEATURES.md', 'LICENSE', '.gitignore', '.gitattributes', 'server.py', 'requirements.txt', 'requirements.lock.txt', 'pytest.ini']:
        archive.write(root / name, 'source/' + name)
    archive.write(root / 'HOSTING.md', 'HOSTING.md')
    archive.write(root / 'FEATURES.md', 'FEATURES.md')
    archive.write(root / 'LICENSE', 'LICENSE')
    archive.write(root / 'README.md', 'README.md')
    archive.write(root / 'THIRD_PARTY.md', 'THIRD_PARTY.md')
    archive.writestr('source/REBUILD.md', 'Run Install Dependencies.bat to install a private Node.js runtime, restore the Office assets from ../site, install the locked npm dependencies, and build the editor. Then run launch bide.bat. For manual builds, run npm ci --ignore-scripts, npm run assets:office, and npm run build. npm test runs browser PDF engine tests; the Python test file is the older engine reference.\n')
print(f'{target}\n{target.stat().st_size / 1024 / 1024:.1f} MB')
