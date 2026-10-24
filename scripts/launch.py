"""Abre o Jarvis numa janela de aplicativo, com backend local e sessão efêmera."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
from urllib.error import URLError
from urllib.request import urlopen
import webbrowser

ROOT = Path(__file__).resolve().parents[1]


def browser_command(url):
    candidates = []
    if os.name == "nt":
        for base in [os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)"), os.environ.get("LOCALAPPDATA")]:
            if base:
                candidates.extend(Path(base) / path for path in ["Microsoft/Edge/Application/msedge.exe", "Google/Chrome/Application/chrome.exe"])
    candidates.extend(Path(path) for name in ["msedge", "google-chrome", "chromium", "chromium-browser"] if (path := shutil.which(name)))
    browser = next((path for path in candidates if path.is_file()), None)
    return [str(browser), f"--app={url}", "--start-maximized"] if browser else None


def free_port():
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", 8765))
        except OSError:
            probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def main():
    parser = argparse.ArgumentParser(description="Iniciar o aplicativo Jarvis")
    parser.add_argument("--no-browser", action="store_true", help="Iniciar somente o núcleo local")
    args = parser.parse_args()
    python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.is_file() or not (ROOT / "frontend/dist/index.html").is_file():
        print("Instale a versão atual primeiro: py -3 scripts/setup.py")
        return 1
    port, token = free_port(), secrets.token_urlsafe(32)
    address = f"http://127.0.0.1:{port}"
    environment = os.environ.copy()
    environment["JARVIS_DESKTOP_TOKEN"] = token
    environment["JARVIS_COOKIE_SECURE"] = "false"  # Sessão em HTTP de loopback, sem exposição remota.
    defaults = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000,http://localhost:8080,http://127.0.0.1:8080"
    environment["JARVIS_ALLOWED_ORIGINS"] = environment.get("JARVIS_ALLOWED_ORIGINS", defaults) + "," + address
    group = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
    process = subprocess.Popen([str(python), "-m", "uvicorn", "app.server:app", "--app-dir", "backend", "--host", "127.0.0.1", "--port", str(port), "--no-access-log"], cwd=ROOT, env=environment, **group)

    def interrupt(*_):
        raise KeyboardInterrupt()

    signal.signal(signal.SIGINT, interrupt)
    signal.signal(signal.SIGTERM, interrupt)
    try:
        for _ in range(150):
            if process.poll() is not None:
                raise RuntimeError("O núcleo encerrou durante a inicialização. Confira o erro acima.")
            try:
                with urlopen(address + "/api/health", timeout=1) as response:
                    health = json.load(response)
                    if health.get("version") == "0.5.0" and health.get("desktop_instance") == hashlib.sha256(token.encode()).hexdigest()[:16]:
                        break
            except (OSError, URLError, ValueError):
                pass
            time.sleep(.2)
        else:
            raise RuntimeError("O núcleo não ficou disponível a tempo.")
        print(f"Jarvis ativo em {address}. Feche esta janela ou pressione Ctrl+C para encerrar o núcleo.", flush=True)
        if not args.no_browser:
            url = address + "/#desktop=" + token
            command = browser_command(url)
            if command:
                subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                print("Edge/Chrome não encontrado. Abrindo no navegador padrão.", flush=True)
                webbrowser.open(url)
        while process.poll() is None:
            time.sleep(.5)
        return process.returncode or 0
    except KeyboardInterrupt:
        return 0
    except (OSError, RuntimeError) as error:
        print(str(error))
        return 1
    finally:
        if process.poll() is None:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=8)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == "__main__":
    sys.exit(main())
