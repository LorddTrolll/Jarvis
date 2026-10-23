"""Inicia ambos os serviços em loopback e encerra os filhos ao sair (Windows/Linux/macOS)."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[1]
python = root / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
npm = 'npm.cmd' if os.name == 'nt' else 'npm'
if not python.exists() or not (root / 'frontend/node_modules').exists():
    sys.exit('Instale as dependências conforme o README antes de iniciar.')
processes = []


def shutdown(*_):
    for process in processes:
        if os.name == 'nt':
            if process.poll() is None:
                subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
    for process in processes:
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.kill()


def interrupted(*_):
    shutdown()
    raise SystemExit(0)


signal.signal(signal.SIGINT, interrupted)
signal.signal(signal.SIGTERM, interrupted)
environment = os.environ.copy()
environment.setdefault('npm_config_cache', str(root.parent / '.cache/npm'))
try:
    group = {'creationflags': subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == 'nt' else {'start_new_session': True}
    processes.append(subprocess.Popen([str(python), '-m', 'uvicorn', 'app.server:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', '8000', '--reload'], cwd=root, env=environment, **group))
    processes.append(subprocess.Popen([npm, 'run', 'dev', '--', '--port', '5173', '--strictPort'], cwd=root / 'frontend', env=environment, **group))
    while all(p.poll() is None for p in processes):
        time.sleep(0.5)
    exit_code = next((p.returncode for p in processes if p.returncode), 0)
finally:
    shutdown()
sys.exit(exit_code)
