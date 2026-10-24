import asyncio
import hashlib
import hmac
import json
import logging
import secrets
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete, select, update

from . import ai, services
from .config import Settings
from .database import Audit, Document, Draft, Message, Search, Task, initialize, now
from .schemas import Approval, ChatInput, DraftCreate, Login, Query, TaskCreate, TaskUpdate
from .memory import store as memory
from .memory.api import ingest, router as neural_router
from .environment import EnvironmentService, router as environment_router
from .system import SystemMonitor
from .education.service import KnowledgeHub
from .education.api import router as education_router
from .memory.models import (Conversation, DocumentChunk, DocumentOriginal, MemoryEdge, MemoryNode,
                            MemorySuppression, MessageConversation)

log = logging.getLogger("jarvis")
if not log.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(handler)
log.setLevel(logging.INFO)
log.propagate = False
# Telegram inclui o token no caminho da URL. Não registre URLs HTTP de provedores.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


def create_app(settings: Settings | None = None):
    settings = settings or Settings()
    engine, sessions = initialize(settings)
    browser_sessions = {}
    approvals = {}
    limits = defaultdict(deque)
    chat_lock = asyncio.Lock()
    environment = EnvironmentService()
    monitor = SystemMonitor()
    knowledge = KnowledgeHub(settings, sessions)

    @asynccontextmanager
    async def lifespan(app):
        knowledge.recover()
        knowledge.retention(now() - timedelta(days=settings.history_days))
        with sessions() as db:
            cutoff = now() - timedelta(days=settings.history_days)
            for model in (Message, Search, Audit):
                db.execute(delete(model).where(model.created_at < cutoff))
            # Não reenvia automaticamente uma operação interrompida.
            db.execute(update(Draft).where(Draft.state == "sending").values(state="uncertain"))
            db.commit()
            memory.bootstrap(db)
        yield
        await knowledge.close()
        engine.dispose()

    app = FastAPI(title="JARVIS AI", version="0.6.0", lifespan=lifespan)
    app.state.sessions = sessions
    app.state.settings = settings
    app.state.environment = environment
    app.state.knowledge = knowledge
    app.add_middleware(CORSMiddleware, allow_origins=list(settings.origins), allow_credentials=True,
                       allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"], allow_headers=["Content-Type", "X-Jarvis-Confirm"])

    @app.middleware("http")
    async def protection(request: Request, call_next):
        if request.url.path.startswith("/api"):
            ip = request.client.host if request.client else "unknown"
            bucket_key = (ip, "login" if request.url.path == "/api/session" and request.method == "POST" else "api")
            bucket = limits[bucket_key]
            timestamp = time.monotonic()
            while bucket and bucket[0] < timestamp - 60:
                bucket.popleft()
            maximum = settings.login_rate_per_minute if bucket_key[1] == "login" else settings.api_rate_per_minute
            if len(bucket) >= maximum:
                return Response('Confirme o limite de requisições e tente em um minuto.', status_code=429)
            bucket.append(timestamp)
            # Impede CSRF e uso por páginas de terceiros; não aceita Origin null.
            origin = request.headers.get("origin")
            if origin and origin not in settings.origins:
                return Response("Origem não autorizada.", status_code=403)
            length = request.headers.get("content-length")
            if length and (not length.isdigit() or int(length) > 11_000_000):
                return Response("Requisição muito grande.", status_code=413)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Permissions-Policy"] = "camera=(self), microphone=(self), geolocation=(self)"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; connect-src 'self' ws://localhost:5173 ws://127.0.0.1:5173; "
            "worker-src 'self' blob:; font-src 'self' data: blob:; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def authenticate(request: Request):
        token = request.cookies.get("jarvis_session", "")
        expires = browser_sessions.get(token, 0)
        if expires < time.time():
            browser_sessions.pop(token, None)
            raise HTTPException(401, "Entre para continuar.")
        return token

    def database():
        with sessions() as db:
            yield db

    def audit(db, action, detail):
        db.add(Audit(action=action, detail=detail))
        db.commit()
        log.info(json.dumps({"event": action, "detail": detail}, ensure_ascii=False))

    auth = [Depends(authenticate)]
    app.include_router(neural_router(database, authenticate, sessions, chat_lock))
    app.include_router(environment_router(environment, authenticate))
    app.include_router(education_router(knowledge, database, authenticate))

    @app.get("/api/health")
    def health():
        result = {"status": "ok", "version": "0.6.0"}
        if settings.desktop_token:
            result["desktop_instance"] = hashlib.sha256(settings.desktop_token.encode()).hexdigest()[:16]
        return result

    @app.get("/api/session")
    def session_status(request: Request):
        return {"authenticated": browser_sessions.get(request.cookies.get("jarvis_session", ""), 0) > time.time(),
                "password_required": bool(settings.password)}

    @app.post("/api/session")
    def login(body: Login, request: Request, response: Response):
        local = request.client and request.client.host in {"127.0.0.1", "::1", "testclient"}
        if not settings.password and not local:
            raise HTTPException(403, "Configure JARVIS_PASSWORD para acesso remoto.")
        desktop = (request.client and request.client.host in {"127.0.0.1", "::1"} and bool(settings.desktop_token)
                   and hmac.compare_digest(request.headers.get("X-Jarvis-Desktop", "").encode(), settings.desktop_token.encode()))
        if not desktop and not hmac.compare_digest(body.password.encode(), settings.password.encode()):
            raise HTTPException(401, "Senha inválida.")
        timestamp = time.time()
        for key, expiry in list(browser_sessions.items()):
            if expiry < timestamp:
                browser_sessions.pop(key, None)
        old = request.cookies.get("jarvis_session")
        if old:
            browser_sessions.pop(old, None)
        token = secrets.token_urlsafe(32)
        browser_sessions[token] = timestamp + 43200
        response.set_cookie("jarvis_session", token, httponly=True, samesite="strict",
                            secure=settings.cookie_secure, max_age=43200)
        return {"authenticated": True}

    @app.delete("/api/session")
    def logout(request: Request, response: Response):
        browser_sessions.pop(request.cookies.get("jarvis_session", ""), None)
        response.delete_cookie("jarvis_session")
        return {"ok": True}

    @app.get("/api/status", dependencies=auth)
    def status():
        return {"ai_configured": bool(settings.openai_key), "ai_model": settings.openai_model,
                "search_configured": bool(settings.search_key), "telegram_configured": bool(settings.telegram_token),
                "storage": "SQLite local", "history_days": settings.history_days, "password_enabled": bool(settings.password)}

    @app.get("/api/system", dependencies=auth)
    def system_metrics():
        return monitor.sample()

    @app.get("/api/messages", dependencies=auth)
    def messages(db=Depends(database)):
        return list(reversed(list(db.scalars(select(Message).order_by(Message.id.desc()).limit(200)))))

    @app.post("/api/chat", dependencies=auth)
    async def chat(body: ChatInput):
        if chat_lock.locked():
            raise HTTPException(409, "Uma resposta já está em andamento. Aguarde.")

        async def events():
            async with chat_lock:
                with sessions() as db:
                    try:
                        async for event in ai.conversation(settings, db, body.text, body.allow_documents,
                                                          body.temporary, body.temporary_history, body.environment, environment, knowledge):
                            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                    except asyncio.CancelledError:
                        db.rollback()
                        raise
        return StreamingResponse(events(), media_type="text/event-stream",
                                 headers={"X-Accel-Buffering": "no"})

    @app.get("/api/tasks", dependencies=auth)
    def tasks(db=Depends(database)):
        return list(db.scalars(select(Task).order_by(Task.done, Task.id.desc())))

    @app.post("/api/tasks", dependencies=auth, status_code=201)
    def create_task(body: TaskCreate, db=Depends(database)):
        task = Task(**body.model_dump())
        db.add(task)
        db.commit()
        return task

    @app.patch("/api/tasks/{task_id}", dependencies=auth)
    def update_task(task_id: int, body: TaskUpdate, db=Depends(database)):
        task = db.get(Task, task_id)
        if not task:
            raise HTTPException(404, "Tarefa não encontrada.")
        was_done = task.done
        task.done = body.done
        if body.done and not was_done:
            memory.capture_task(db, task)
        db.commit()
        return task

    @app.delete("/api/tasks/{task_id}", dependencies=auth)
    def delete_task(task_id: int, db=Depends(database)):
        task = db.get(Task, task_id)
        if not task:
            raise HTTPException(404, "Tarefa não encontrada.")
        memory.remove_task(db, task.id)
        db.delete(task)
        db.commit()
        return {"ok": True}

    @app.get("/api/documents", dependencies=auth)
    def documents(db=Depends(database)):
        return [{"id": d.id, "name": d.name, "characters": len(d.content), "created_at": d.created_at}
                for d in db.scalars(select(Document).order_by(Document.id.desc()))]

    @app.post("/api/documents", dependencies=auth, status_code=201)
    async def upload(file: UploadFile, db=Depends(database)):
        raw = bytearray()
        while block := await file.read(64 * 1024):
            raw.extend(block)
            if len(raw) > 10_000_000:
                raise HTTPException(413, "O limite é 10 MB por arquivo.")
        name = Path((file.filename or "arquivo").replace("\\", "/")).name[:255]
        return await asyncio.to_thread(ingest, db, name, bytes(raw), services.extract_document)

    @app.get("/api/documents/{document_id}/original", dependencies=auth)
    def original(document_id: int, download: bool = False, db=Depends(database)):
        from urllib.parse import quote
        file = db.get(DocumentOriginal, document_id)
        doc = db.get(Document, document_id)
        if not file or not doc:
            raise HTTPException(404, "Original indisponível. Reimporte o documento criado na versão anterior.")
        disposition = "attachment" if download else "inline"
        return Response(file.data, media_type=file.mime, headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(doc.name, safe='')}",
            "Accept-Ranges": "none"})

    @app.post("/api/documents/search", dependencies=auth)
    def find_documents(body: Query, db=Depends(database)):
        return services.search_documents(db, body.query)

    @app.delete("/api/documents/{document_id}", dependencies=auth)
    def remove_document(document_id: int, db=Depends(database)):
        doc = db.get(Document, document_id)
        if not doc:
            raise HTTPException(404, "Documento não encontrado.")
        memory.remove_document(db, document_id)
        db.delete(doc)
        audit(db, "document_deleted", str(document_id))
        return {"ok": True}

    @app.post("/api/search", dependencies=auth)
    async def search(body: Query, db=Depends(database)):
        return await services.web_search(settings, db, body.query)

    @app.get("/api/searches", dependencies=auth)
    def searches(db=Depends(database)):
        return [{"id": r.id, "query": r.query, "created_at": r.created_at, "results": json.loads(r.result)}
                for r in db.scalars(select(Search).order_by(Search.id.desc()).limit(30))]

    @app.get("/api/integrations", dependencies=auth)
    def integrations():
        return ai.accounts(settings)

    @app.get("/api/drafts", dependencies=auth)
    def drafts(db=Depends(database)):
        return list(db.scalars(select(Draft).order_by(Draft.id.desc()).limit(100)))

    @app.post("/api/drafts", dependencies=auth, status_code=201)
    def create_draft(body: DraftCreate, db=Depends(database)):
        draft = Draft(**body.model_dump())
        db.add(draft)
        audit(db, "draft_created", "telegram")
        return draft

    @app.post("/api/drafts/{draft_id}/approve", dependencies=auth)
    def approve(draft_id: int, session=Depends(authenticate), db=Depends(database)):
        draft = db.get(Draft, draft_id)
        if not draft or draft.state != "draft":
            raise HTTPException(409, "Rascunho indisponível para aprovação.")
        if not settings.telegram_token:
            raise HTTPException(503, "Configure JARVIS_TELEGRAM_TOKEN no backend antes de aprovar.")
        for key, value in list(approvals.items()):
            if value[3] < time.time():
                approvals.pop(key, None)
        token = secrets.token_urlsafe(32)
        fingerprint = hashlib.sha256(f"{draft.recipient}:{draft.text}".encode()).hexdigest()
        approvals[token] = (draft.id, session, fingerprint, time.time() + 120)
        return {"token": token, "expires_in": 120}

    @app.post("/api/drafts/{draft_id}/send", dependencies=auth)
    async def send(draft_id: int, body: Approval, session=Depends(authenticate), db=Depends(database)):
        approval = approvals.pop(body.token, None)
        draft = db.get(Draft, draft_id)
        fingerprint = hashlib.sha256(f"{draft.recipient}:{draft.text}".encode()).hexdigest() if draft else ""
        if not approval or approval[:3] != (draft_id, session, fingerprint) or approval[3] < time.time():
            raise HTTPException(403, "Aprovação inválida, expirada ou já utilizada.")
        # Compare-and-set atômico: dois cliques ou duas abas nunca enviam o mesmo rascunho duas vezes.
        result = db.execute(update(Draft).where(Draft.id == draft_id, Draft.state == "draft").values(state="sending"))
        db.commit()
        if result.rowcount != 1:
            raise HTTPException(409, "Rascunho já processado.")
        try:
            external_id = await services.send_telegram(settings, draft.recipient, draft.text)
        except HTTPException:
            draft.state = "uncertain"
            audit(db, "message_uncertain", str(draft_id))
            raise
        draft.state, draft.external_id = "sent", external_id
        audit(db, "message_sent", str(draft_id))
        return {"state": "sent", "external_id": external_id}

    @app.get("/api/audit", dependencies=auth)
    def audits(db=Depends(database)):
        return list(db.scalars(select(Audit).order_by(Audit.id.desc()).limit(100)))

    @app.delete("/api/data", dependencies=auth)
    def clear_data(request: Request, db=Depends(database)):
        if request.headers.get("X-Jarvis-Confirm") != "DELETE":
            raise HTTPException(400, "Confirmação de exclusão ausente.")
        if chat_lock.locked() or knowledge.active():
            raise HTTPException(409, "Interrompa a resposta antes de excluir dados.")
        if db.scalar(select(Draft.id).where(Draft.state == "sending").limit(1)):
            raise HTTPException(409, "Aguarde a conclusão do envio antes de excluir dados.")
        from .education.models import ShareEvent, TeachingFile, LessonRevision, LessonJob, Research, TeachingPreferences
        for model in (ShareEvent, TeachingFile, LessonRevision, LessonJob, Research, TeachingPreferences,
                      MemoryEdge, MemoryNode, MemorySuppression, MessageConversation, Conversation,
                      DocumentChunk, DocumentOriginal, Message, Task, Document, Draft, Search, Audit):
            db.execute(delete(model))
        memory.touch(db)
        memory.state(db).view = "{}"
        db.commit()
        approvals.clear()
        return {"ok": True}

    frontend = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if frontend.is_dir():
        app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
    return app
