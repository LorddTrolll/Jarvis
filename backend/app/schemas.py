from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, field_validator
from .environment import EnvironmentContext


class Login(BaseModel):
    password: str = Field(default="", max_length=1024)


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    priority: Literal["normal", "alta", "baixa"] = "normal"
    due_at: datetime | None = None

    @field_validator("title")
    @classmethod
    def title_valid(cls, value):
        if not value.strip():
            raise ValueError("Informe um título.")
        return value.strip()

    @field_validator("due_at")
    @classmethod
    def timezone_required(cls, value):
        if value is not None and value.tzinfo is None:
            raise ValueError("Inclua o fuso horário.")
        return value


class TaskUpdate(BaseModel):
    done: bool


class ChatInput(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    allow_documents: bool = False
    temporary: bool = False
    temporary_history: list["HistoryMessage"] = Field(default_factory=list, max_length=24)
    environment: EnvironmentContext | None = None


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class Query(BaseModel):
    query: str = Field(min_length=2, max_length=500)


class DraftCreate(BaseModel):
    platform: Literal["telegram"] = "telegram"
    recipient: str = Field(pattern=r"^-?\d{1,20}$", max_length=21)
    text: str = Field(min_length=1, max_length=4000)


class Approval(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class Panel(BaseModel):
    panel_name: Literal["dashboard", "neural", "education", "chat", "vision", "tasks", "search", "files", "integrations", "settings"]
