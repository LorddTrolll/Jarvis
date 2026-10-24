from datetime import datetime
from sqlalchemy import ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base, UTCDateTime, now


class MemoryNode(Base):
    __tablename__ = "memory_nodes"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    kind: Mapped[str] = mapped_column(String(30), index=True)
    title: Mapped[str] = mapped_column(String(300))
    content: Mapped[str] = mapped_column(Text)
    origin: Mapped[str] = mapped_column(String(200), unique=True)
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    meta: Mapped[str] = mapped_column(Text, default="{}")
    embedding: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now, index=True)


class MemoryEdge(Base):
    __tablename__ = "memory_edges"
    __table_args__ = (UniqueConstraint("source", "target", "relation"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(ForeignKey("memory_nodes.id", ondelete="CASCADE"), index=True)
    target: Mapped[str] = mapped_column(ForeignKey("memory_nodes.id", ondelete="CASCADE"), index=True)
    relation: Mapped[str] = mapped_column(String(40))
    weight: Mapped[float]
    reason: Mapped[str] = mapped_column(Text)


class DocumentOriginal(Base):
    __tablename__ = "document_originals"
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True)
    sha256: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    mime: Mapped[str] = mapped_column(String(100))
    data: Mapped[bytes] = mapped_column(LargeBinary)


class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    offset: Mapped[int]
    content: Mapped[str] = mapped_column(Text)


class Conversation(Base):
    __tablename__ = "memory_conversations"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class MessageConversation(Base):
    __tablename__ = "message_conversations"
    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("memory_conversations.id"), index=True)


class MemoryState(Base):
    __tablename__ = "memory_state"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    revision: Mapped[int] = mapped_column(default=0)
    initialized: Mapped[bool] = mapped_column(default=False)
    auto_save: Mapped[bool] = mapped_column(default=True)
    gesture: Mapped[str] = mapped_column(Text, default="{}")
    view: Mapped[str] = mapped_column(Text, default="{}")


class MemorySuppression(Base):
    __tablename__ = "memory_suppressions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
