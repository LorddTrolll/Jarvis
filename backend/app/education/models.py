from sqlalchemy import ForeignKey, LargeBinary, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base, UTCDateTime, now
from datetime import datetime


class Research(Base):
    __tablename__ = "education_research"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    query: Mapped[str] = mapped_column(String(500))
    payload: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)
    memory_id: Mapped[str | None] = mapped_column(ForeignKey("memory_nodes.id", ondelete="SET NULL"), nullable=True)


class TeachingPreferences(Base):
    __tablename__ = "teaching_preferences"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    payload: Mapped[str] = mapped_column(Text, default="{}")


class LessonJob(Base):
    __tablename__ = "lesson_jobs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    status: Mapped[str] = mapped_column(String(24), default="queued", index=True)
    stage: Mapped[str] = mapped_column(String(160), default="Na fila")
    progress: Mapped[int] = mapped_column(default=0)
    request: Mapped[str] = mapped_column(Text)
    plan: Mapped[str] = mapped_column(Text, default="{}")
    context: Mapped[str] = mapped_column(Text, default="{}")
    warnings: Mapped[str] = mapped_column(Text, default="[]")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    revision: Mapped[int] = mapped_column(default=1)
    memory_id: Mapped[str | None] = mapped_column(ForeignKey("memory_nodes.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class LessonRevision(Base):
    __tablename__ = "lesson_revisions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("lesson_jobs.id", ondelete="CASCADE"), index=True)
    number: Mapped[int]
    plan: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class TeachingFile(Base):
    __tablename__ = "teaching_files"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("lesson_jobs.id", ondelete="CASCADE"), index=True)
    revision: Mapped[int]
    name: Mapped[str] = mapped_column(String(220))
    kind: Mapped[str] = mapped_column(String(32))
    mime: Mapped[str] = mapped_column(String(80), default="application/pdf")
    data: Mapped[bytes] = mapped_column(LargeBinary)
    sha256: Mapped[str] = mapped_column(String(64))
    pages: Mapped[int]
    document_id: Mapped[int | None] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), nullable=True)


class ShareEvent(Base):
    __tablename__ = "education_shares"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    job_id: Mapped[str] = mapped_column(ForeignKey("lesson_jobs.id", ondelete="CASCADE"), index=True)
    file_id: Mapped[str | None] = mapped_column(ForeignKey("teaching_files.id", ondelete="SET NULL"), nullable=True)
    state: Mapped[str] = mapped_column(String(40))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)
