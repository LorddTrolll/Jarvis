import asyncio
import hashlib
import io
import json
import warnings
from datetime import datetime
from typing import Literal
from urllib.parse import quote
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, select
from ..database import Document, Message, Search
from .models import DocumentOriginal, MemoryEdge, MemoryNode, MemoryState
from .semantic import SemanticIndex
from . import store


class NeuralGestureConfiguration(BaseModel):
    pinch_threshold: float = Field(.28, ge=.12, le=.5)
    double_ms: int = Field(450, ge=300, le=700)
    hold_ms: int = Field(600, ge=450, le=1200)
    reverse_amplitude: float = Field(.75, ge=.5, le=1.5)
    reverse_ms: int = Field(220, ge=150, le=650)


class ViewState(BaseModel):
    level: Literal["global", "cluster", "file"] = "global"
    selected: str | None = Field(None, max_length=64)
    parent: str | None = Field(None, max_length=64)
    camera: tuple[float, float, float] | None = None
    target: tuple[float, float, float] | None = None
    global_camera: tuple[float, float, float] | None = None
    global_target: tuple[float, float, float] | None = None
    cluster_camera: tuple[float, float, float] | None = None
    cluster_target: tuple[float, float, float] | None = None

    @field_validator("camera", "target", "global_camera", "global_target", "cluster_camera", "cluster_target")
    @classmethod
    def finite_coordinates(cls, value):
        import math
        if value and any(not math.isfinite(x) or abs(x) > 1000 for x in value):
            raise ValueError("Coordenadas inválidas.")
        return value


class Preferences(BaseModel):
    auto_save: bool = True
    gesture: NeuralGestureConfiguration = Field(default_factory=NeuralGestureConfiguration)
    view: ViewState = Field(default_factory=ViewState)


class MemoryCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    content: str = Field(default="", max_length=50000)
    kind: Literal["project", "note"] = "note"
    members: list[str] = Field(default_factory=list, max_length=100)


class NeuralQuery(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    kind: str | None = None
    after: datetime | None = None
    before: datetime | None = None

    @field_validator("after", "before")
    @classmethod
    def timezone_required(cls, value):
        if value and value.tzinfo is None:
            raise ValueError("Inclua o fuso horário.")
        return value


def node_data(node):
    return {"id": node.id, "kind": node.kind, "title": node.title, "excerpt": node.content[:220],
            "source_id": node.source_id, "created_at": node.created_at, "meta": json.loads(node.meta)}


def media_content(name, raw, extract):
    extension = name.rsplit(".", 1)[-1].lower()
    mime = {"pdf": "application/pdf", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "txt": "text/plain", "md": "text/markdown", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "webp": "image/webp", "mp4": "video/mp4", "webm": "video/webm"}.get(extension)
    if not mime:
        raise HTTPException(415, "Use PDF, DOCX, TXT, MD, PNG, JPG, WebP, MP4 ou WebM.")
    if mime.startswith("image/"):
        from PIL import Image
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                image = Image.open(io.BytesIO(raw))
                if image.format not in {"PNG", "JPEG", "WEBP"} or image.width * image.height > 25_000_000:
                    raise ValueError()
                width, height = image.size
                image.verify()
            return "image", f"Imagem {name}. Dimensões: {width} × {height} pixels. Sem OCR automático.", mime, {"width": width, "height": height, "bytes": len(raw)}
        except Exception:
            raise HTTPException(422, "Imagem inválida ou acima de 25 milhões de pixels.")
    if mime.startswith("video/"):
        valid = len(raw) > 12 and (extension == "mp4" and raw[4:8] == b"ftyp" or extension == "webm" and raw[:4] == b"\x1a\x45\xdf\xa3")
        if not valid:
            raise HTTPException(422, "Vídeo inválido. Use MP4 ou WebM até 10 MB.")
        return "video", f"Vídeo {name}. {len(raw)} bytes. Sem transcrição automática.", mime, {"bytes": len(raw)}
    content = extract(name, raw)
    return "document", content, mime, {"bytes": len(raw)}


def ingest(db, name, raw, extract):
    sha = hashlib.sha256(raw).hexdigest()
    original = db.scalar(select(DocumentOriginal).where(DocumentOriginal.sha256 == sha))
    if original:
        doc = db.get(Document, original.document_id)
        node = db.scalar(select(MemoryNode).where(MemoryNode.source_id == doc.id, MemoryNode.kind.in_(["document", "image", "video"])))
        return {"id": doc.id, "name": doc.name, "characters": len(doc.content), "node_id": node.id if node else None, "duplicate": True}
    kind, content, mime, meta = media_content(name, raw, extract)
    # Reimportação de documento legado recupera o original sem criar segunda memória.
    doc = db.scalar(select(Document).where(Document.name == name, Document.content == content))
    if doc and db.get(DocumentOriginal, doc.id):
        doc = None
    if not doc:
        doc = Document(name=name, content=content); db.add(doc); db.flush()
    store.store_original(db, doc, raw, mime)
    node = store.capture_document(db, doc, kind, meta)
    db.commit()
    return {"id": doc.id, "name": doc.name, "characters": len(content), "node_id": node.id if node else None, "duplicate": False}


def router(database, authenticate, sessions, chat_lock):
    routes = APIRouter(prefix="/api/neural", dependencies=[Depends(authenticate)])
    index = SemanticIndex()

    @routes.get("/graph")
    def graph(limit: int = Query(1000, ge=50, le=5000), offset: int = Query(0, ge=0),
              kind: str | None = None, after: datetime | None = None, before: datetime | None = None, db=Depends(database)):
        index.ensure(db)
        query = select(MemoryNode)
        if kind:
            query = query.where(MemoryNode.kind == kind)
        if after:
            query = query.where(MemoryNode.created_at >= after)
        if before:
            query = query.where(MemoryNode.created_at <= before)
        total = db.scalar(select(func.count()).select_from(query.subquery()))
        nodes = list(db.scalars(query.order_by(MemoryNode.created_at.desc(), MemoryNode.id).offset(offset).limit(limit)))
        ids = [n.id for n in nodes]
        edges = list(db.scalars(select(MemoryEdge).where(MemoryEdge.source.in_(ids), MemoryEdge.target.in_(ids)))) if ids else []
        categories = dict(db.execute(select(MemoryNode.kind, func.count()).group_by(MemoryNode.kind)).all())
        return {"nodes": [node_data(n) for n in nodes], "edges": [{"source": e.source, "target": e.target, "relation": e.relation,
                "weight": e.weight, "reason": e.reason} for e in edges], "total": total, "categories": categories,
                "revision": store.state(db).revision, "next_offset": offset + len(nodes) if offset + len(nodes) < total else None,
                "embedding_method": "TF-IDF + LSA local"}

    @routes.get("/nodes/{identifier}")
    def detail(identifier: str, db=Depends(database)):
        index.ensure(db)
        node = db.get(MemoryNode, identifier)
        if not node:
            raise HTTPException(404, "Memória não encontrada.")
        edges = list(db.scalars(select(MemoryEdge).where((MemoryEdge.source == identifier) | (MemoryEdge.target == identifier))))
        related = []
        for edge in sorted(edges, key=lambda e: -e.weight)[:30]:
            other = db.get(MemoryNode, edge.target if edge.source == identifier else edge.source)
            if other:
                related.append({**node_data(other), "reason": edge.reason, "weight": edge.weight, "relation": edge.relation})
        original = db.get(DocumentOriginal, node.source_id) if node.kind in ("document", "image", "video") else None
        return {**node_data(node), "content": node.content, "related": related,
                "original_url": f"/api/documents/{node.source_id}/original" if original else None,
                "mime": original.mime if original else None}

    @routes.post("/nodes", status_code=201)
    def create(body: MemoryCreate, db=Depends(database)):
        if not body.title.strip():
            raise HTTPException(422, "Informe um título.")
        members = [db.get(MemoryNode, identifier) for identifier in body.members]
        if any(m is None for m in members):
            raise HTTPException(404, "Uma das memórias selecionadas não existe.")
        node = store.upsert(db, body.kind, body.title.strip(), body.content, "manual:" + str(uuid4()))
        for member in members:
            store.link(db, node.id, member.id, "project", "Vínculo escolhido explicitamente pelo proprietário.")
        db.commit()
        return node_data(node)

    @routes.delete("/nodes/{identifier}")
    def remove(identifier: str, db=Depends(database)):
        if chat_lock.locked():
            raise HTTPException(409, "Interrompa a resposta antes de excluir uma memória.")
        if not store.remove_node(db, identifier):
            raise HTTPException(404, "Memória não encontrada.")
        db.commit()
        return {"ok": True}

    @routes.post("/search")
    def search(body: NeuralQuery, db=Depends(database)):
        if body.kind == "topic":
            index.ensure(db)
            from ..services import words
            terms = words(body.query)
            topics = [n for n in db.scalars(select(MemoryNode).where(MemoryNode.kind == "topic"))
                      if terms & words(n.title) and (not body.after or n.created_at >= body.after)
                      and (not body.before or n.created_at <= body.before)]
            return {"query": body.query, "results": [{**node_data(n), "score": 1, "method": "termos extraídos localmente"} for n in topics[:20]], "external": False}
        return {"query": body.query, "results": index.search(db, body.query, body.kind, body.after, body.before),
                "method": "TF-IDF + LSA local", "external": False}

    @routes.get("/preferences")
    def preferences(db=Depends(database)):
        current = store.state(db)
        return Preferences(auto_save=current.auto_save, gesture=json.loads(current.gesture), view=json.loads(current.view))

    @routes.put("/preferences")
    def save_preferences(body: Preferences, db=Depends(database)):
        current = store.state(db)
        current.auto_save, current.gesture, current.view = body.auto_save, body.gesture.model_dump_json(), body.view.model_dump_json()
        db.commit()
        return body

    @routes.get("/events")
    async def events():
        async def stream():
            previous = None
            while True:
                with sessions() as db:
                    revision = store.state(db).revision
                if revision != previous:
                    yield f"data: {json.dumps({'revision': revision})}\n\n"
                    previous = revision
                else:
                    yield ": heartbeat\n\n"
                await asyncio.sleep(2)
        return StreamingResponse(stream(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})

    return routes
