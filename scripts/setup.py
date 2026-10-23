"""Instalação repetível com lockfiles e verificação de hashes (Python 3.11+, Node 24)."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import venv

root = Path(__file__).resolve().parents[1]
if sys.version_info < (3, 11):
    sys.exit('É necessário Python 3.11 ou superior.')
npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
node = shutil.which('node')
if not npm or not node:
    sys.exit('Instale Node.js 24 (inclui npm) e execute novamente.')
version = subprocess.check_output([node, '-p', 'JSON.stringify(process.versions.node.split(".").map(Number))'], text=True)
if tuple(json.loads(version)[:2]) < (24, 5):
    sys.exit('Use Node.js 24.5 ou superior para suporte ao proxy HTTPS do instalador.')
python = root / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
if not python.exists():
    venv.create(root / '.venv', with_pip=True)
if subprocess.run([str(python), '-m', 'pip', '--version'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
    subprocess.run([str(python), '-m', 'ensurepip', '--upgrade'], check=True)
subprocess.run([str(python), '-m', 'pip', 'install', '--disable-pip-version-check', '--require-hashes', '-r', str(root / 'backend/requirements-dev.lock')], cwd=root, check=True)
for args in [('ci',), ('run', 'assets'), ('run', 'build')]:
    subprocess.run([npm, *args], cwd=root / 'frontend', check=True)
print('Instalação concluída. Inicie com: python scripts/dev.py')
