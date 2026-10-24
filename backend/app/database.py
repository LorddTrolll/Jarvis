from datetime import datetime, timezone
from sqlalchemy import Boolean, DateTime, Integer, String, Text, create_engine, event, inspect
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.types import TypeDecorator


def now() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """SQLite não mantém offsets; guarda UTC e devolve datas ISO com fuso."""
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is not None:
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return None

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=timezone.utc) if value is not None else None


class Base(DeclarativeBase):
    pass


class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[str] = mapped_column(String(20))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(300))
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    priority: Mapped[str] = mapped_column(String(20), default="normal")
    due_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class Draft(Base):
    __tablename__ = "drafts"
    id: Mapped[int] = mapped_column(primary_key=True)
    platform: Mapped[str] = mapped_column(String(30))
    recipient: Mapped[str] = mapped_column(String(120))
    text: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(30), default="draft")
    external_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class Audit(Base):
    __tablename__ = "audit"
    id: Mapped[int] = mapped_column(primary_key=True)
    action: Mapped[str] = mapped_column(String(100))
    detail: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


class Search(Base):
    __tablename__ = "searches"
    id: Mapped[int] = mapped_column(primary_key=True)
    query: Mapped[str] = mapped_column(String(500))
    result: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=now)


def initialize(settings):
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{settings.data_dir / 'jarvis.db'}", connect_args={"check_same_thread": False})
    @event.listens_for(engine, "connect")
    def sqlite_settings(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=10000")
        connection.execute("PRAGMA journal_mode=WAL")
    # Migração aditiva; preserva o banco anterior em backup local uma única vez.
    from .memory import models  # noqa: F401 — registra novas tabelas no metadata
    from .education import models as education_models  # noqa: F401
    if inspect(engine).has_table("memory_nodes") and not inspect(engine).has_table("lesson_jobs"):
        import sqlite3
        backups = settings.data_dir / "backups"
        backups.mkdir(exist_ok=True)
        backup_path = backups / "before-education-v1.db"
        if not backup_path.exists():
            with sqlite3.connect(settings.data_dir / "jarvis.db") as original, sqlite3.connect(backup_path) as backup:
                original.backup(backup)
    if inspect(engine).has_table("documents") and not inspect(engine).has_table("memory_state"):
        import sqlite3
        backups = settings.data_dir / "backups"
        backups.mkdir(exist_ok=True)
        with sqlite3.connect(settings.data_dir / "jarvis.db") as original, sqlite3.connect(backups / "before-neural-v1.db") as backup:
            original.backup(backup)
    Base.metadata.create_all(engine)
    return engine, sessionmaker(engine, expire_on_commit=False)
