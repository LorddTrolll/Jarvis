// Backend isolado para testes: nunca usa banco ou credenciais do proprietário.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const data = mkdtempSync(path.join(os.tmpdir(), 'jarvis-e2e-'))
const python = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const child = spawn(python, ['-m', 'uvicorn', 'app.server:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', '8000', '--no-access-log'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, JARVIS_DATA_DIR: data, JARVIS_PASSWORD: 'e2e-password',
    JARVIS_OPENAI_KEY: '', JARVIS_SEARCH_KEY: '', JARVIS_TELEGRAM_TOKEN: '', JARVIS_COOKIE_SECURE: 'false', JARVIS_LOGIN_RATE_PER_MINUTE: '100', JARVIS_API_RATE_PER_MINUTE: '1500' },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill('SIGTERM'))
child.on('exit', code => { rmSync(data, { recursive: true, force: true }); process.exit(code || 0) })
child.on('error', error => { console.error(error.message); rmSync(data, { recursive: true, force: true }); process.exit(1) })
