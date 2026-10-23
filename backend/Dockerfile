FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.lock ./backend/requirements.lock
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; \
    python -m venv /app/backend/.venv && /app/backend/.venv/bin/python -m pip install --disable-pip-version-check --no-cache-dir --require-hashes -r backend/requirements.lock
COPY backend/app ./backend/app
EXPOSE 8000
CMD ["/app/backend/.venv/bin/python", "-m", "uvicorn", "app.server:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
