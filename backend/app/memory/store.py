import hashlib
import json
import uuid
from sqlalchemy import delete, select, update
from ..database import Document, Message, Search, Task, now
from .models import (Conversation, DocumentChunk, DocumentOriginal, MemoryEdge, MemoryNode,
                     MemoryState, MemorySuppression, MessageConversation)

KINDS = {"document": "Documentos", "question": "Perguntas", "answer": "Respostas", "search": "Pesquisas",
         "conversation": "Conversas", "project": "Projetos", "topic": "Assuntos", "image": "Imagens", "video": "Vídeos", "note": "Notas", "task": "Tarefas concluídas"}


def state(db):
    value = db.get(MemoryState, 1)
    if value is None:
        value = MemoryState(id=1, revision=0, initialized=False, auto_save=True, gesture="{}", view="{}")
        db.add(value); db.flush()
    return value


def touch(db):
    state(db)
    db.execute(update(MemoryState).where(MemoryState.id == 1).values(revision=MemoryState.revision + 1))


def node_id(origin):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "jarvis-memory:" + origin))


def upsert(db, kind, title, content, origin, source_id=None, meta=None, created_at=None):
    identifier = node_id(origin)
    if db.get(MemorySuppression, identifier):
        return None
    node = db.get(MemoryNode, identifier)
    if node is None:
        node = MemoryNode(id=identifier, kind=kind, title=title[:300], content=content, origin=origin,
                          source_id=source_id, meta=json.dumps(meta or {}, ensure_ascii=False),
                          created_at=created_at or now())
        db.add(node); db.flush(); touch(db)
    return node


def link(db, source, target, relation, reason, weight=1.0):
    if not source or not target or source == target:
        return
    exists = db.scalar(select(MemoryEdge.id).where(MemoryEdge.source == source, MemoryEdge.target == target, MemoryEdge.relation == relation))
    if not exists:
        db.add(MemoryEdge(source=source, target=target, relation=relation, weight=weight, reason=reason))
        db.flush()


def capture_document(db, doc, kind="document", meta=None):
    node = upsert(db, kind, doc.name, doc.content, f"document:{doc.id}:{doc.created_at.isoformat()}", doc.id,
                  {"format": doc.name.rsplit('.', 1)[-1].lower(), **(meta or {})}, doc.created_at)
    if not db.scalar(select(DocumentChunk.id).where(DocumentChunk.document_id == doc.id).limit(1)):
        for offset in range(0, len(doc.content), 900):
            db.add(DocumentChunk(document_id=doc.id, offset=offset, content=doc.content[offset:offset + 1200]))
    return node


def ensure_conversation(db, identifier=None, title="Conversa com o Jarvis"):
    identifier = identifier or "principal"
    conversation = db.get(Conversation, identifier)
    if not conversation:
        conversation = Conversation(id=identifier, title=title[:300]); db.add(conversation); db.flush()
    return conversation


def capture_message(db, message, conversation_id="principal", question_id=None, sources=None):
    conversation = ensure_conversation(db, conversation_id)
    if not db.get(MessageConversation, message.id):
        db.add(MessageConversation(message_id=message.id, conversation_id=conversation.id))
    if not state(db).auto_save:
        return None
    parent = upsert(db, "conversation", conversation.title, "", f"conversation:{conversation.id}",
                    meta={"conversation_id": conversation.id}, created_at=conversation.created_at)
    kind = "question" if message.role == "user" else "answer"
    node = upsert(db, kind, message.content[:100], message.content, f"message:{message.id}:{message.created_at.isoformat()}",
                  message.id, {"sources": sources or [], "conversation_id": conversation.id}, message.created_at)
    if node and parent:
        link(db, parent.id, node.id, "conversation", "Registrado nesta conversa.")
    if kind == "answer" and node and question_id:
        link(db, question_id, node.id, "answer", "Resposta registrada para esta pergunta.")
    for source in sources or []:
        if node and source.get("node_id") and db.get(MemoryNode, source["node_id"]):
            link(db, node.id, source["node_id"], "source", "Fonte realmente consultada pela ferramenta.")
    return node


def capture_search(db, record):
    if state(db).auto_save:
        results = json.loads(record.result)
        content = record.query + "\n" + "\n".join(r.get('title', '') + " " + r.get('description', '') for r in results)
        return upsert(db, "search", record.query, content, f"search:{record.id}:{record.created_at.isoformat()}",
                      record.id, {"sources": results, "provider": "Brave Search"}, record.created_at)


def capture_task(db, task, legacy=False):
    """Uma memória por tarefa concluída; preserva uma fotografia da conclusão."""
    if not task.done:
        return None
    origin = f"task:{task.id}:{task.created_at.isoformat()}"
    identifier = node_id(origin)
    existing = db.get(MemoryNode, identifier)
    if existing and legacy:
        return existing
    completed = None if legacy else now().isoformat()
    content = (f"Tarefa concluída: {task.title}\nPrioridade: {task.priority}\n"
               f"Criada em: {task.created_at.isoformat()}\n"
               f"Conclusão: {completed or 'Data não registrada na versão anterior.'}")
    if task.due_at:
        content += f"\nPrazo: {task.due_at.isoformat()}"
    meta = {"completed_at": completed, "task_created_at": task.created_at.isoformat(), "priority": task.priority}
    if existing:
        existing.title, existing.content, existing.meta = task.title, content, json.dumps(meta, ensure_ascii=False)
        touch(db)
        return existing
    return upsert(db, "task", task.title, content, origin, task.id, meta)


def remove_task(db, task_id):
    for node in list(db.scalars(select(MemoryNode).where(MemoryNode.kind == "task", MemoryNode.source_id == task_id))):
        remove_node(db, node.id, remove_source=False)


def remove_node(db, identifier, remove_source=True, suppress=True):
    node = db.get(MemoryNode, identifier)
    if not node:
        return False
    if remove_source and node.source_id:
        if node.kind in ("document", "image", "video"):
            db.execute(delete(DocumentOriginal).where(DocumentOriginal.document_id == node.source_id))
            db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == node.source_id))
            db.execute(delete(Document).where(Document.id == node.source_id))
        elif node.kind in ("question", "answer"):
            db.execute(delete(MessageConversation).where(MessageConversation.message_id == node.source_id))
            db.execute(delete(Message).where(Message.id == node.source_id))
        elif node.kind == "search":
            db.execute(delete(Search).where(Search.id == node.source_id))
    db.execute(delete(MemoryEdge).where((MemoryEdge.source == identifier) | (MemoryEdge.target == identifier)))
    db.delete(node)
    if suppress and not db.get(MemorySuppression, identifier):
        db.add(MemorySuppression(id=identifier))
    touch(db)
    return True


def remove_document(db, document_id):
    for node in list(db.scalars(select(MemoryNode).where(MemoryNode.source_id == document_id, MemoryNode.kind.in_(["document", "image", "video"])))):
        remove_node(db, node.id, remove_source=False)


def bootstrap(db):
    current = state(db)
    # Migração idempotente: não reativa retroativamente memórias após desligar salvamento automático.
    if not current.initialized:
        for doc in db.scalars(select(Document)):
            capture_document(db, doc)
        previous = None
        for message in db.scalars(select(Message).order_by(Message.id)):
            node = capture_message(db, message, question_id=previous)
            if message.role == "user":
                previous = node.id if node else None
        for record in db.scalars(select(Search)):
            capture_search(db, record)
        current.initialized = True
    # Retrocompatibilidade idempotente, sem inventar datas de conclusão antigas.
    for task in db.scalars(select(Task).where(Task.done.is_(True))):
        capture_task(db, task, legacy=True)
    # Respeita a retenção/exclusão dos dados originais ao reiniciar.
    present = {"question": set(db.scalars(select(Message.id))), "answer": set(db.scalars(select(Message.id))),
               "search": set(db.scalars(select(Search.id))), "document": set(db.scalars(select(Document.id)))}
    for node in list(db.scalars(select(MemoryNode).where(MemoryNode.source_id.is_not(None)))):
        kind = "document" if node.kind in ("image", "video") else node.kind
        if kind in present and node.source_id not in present[kind]:
            remove_node(db, node.id, remove_source=False, suppress=False)
    db.commit()


def store_original(db, doc, raw, mime):
    db.add(DocumentOriginal(document_id=doc.id, sha256=hashlib.sha256(raw).hexdigest(), mime=mime, data=raw))
    touch(db)
