"""Double-click launcher: reuse the local engine or start it without a console window."""
from pathlib import Path
import os
import subprocess
import sys
import time
import urllib.request
import json
import webbrowser

ROOT = Path(__file__).resolve().parent
URL = 'http://127.0.0.1:8765'


def running():
    try:
        with urllib.request.urlopen(URL + '/api/health', timeout=2) as response:
            return json.load(response).get('name') == 'bide'
    except Exception:
        return False


if not running():
    python = ROOT / '.venv' / 'Scripts' / 'python.exe'
    if not python.exists():
        raise SystemExit('Run Setup.cmd first to install the local dependencies.')
    flags = (subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS) if os.name == 'nt' else 0
    with open(ROOT / 'server.log', 'a', encoding='utf-8') as log:
        subprocess.Popen([str(python), str(ROOT / 'server.py')], cwd=ROOT, stdout=log, stderr=log,
                         creationflags=flags, close_fds=True)
    for _ in range(40):
        if running():
            break
        time.sleep(.25)
    else:
        raise SystemExit('The PDF engine could not start. Check server.log; port 8765 may be in use.')

webbrowser.open(URL)
