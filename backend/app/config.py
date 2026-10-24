from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="JARVIS_", env_file=".env", extra="ignore")
    data_dir: Path = Path("data")
    password: str = ""
    cookie_secure: bool = False
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000,http://localhost:8080,http://127.0.0.1:8080"
    openai_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    search_key: str = ""
    telegram_token: str = ""
    history_days: int = Field(default=30, ge=1, le=3650)
    api_rate_per_minute: int = Field(default=300, ge=30, le=3000)
    login_rate_per_minute: int = Field(default=10, ge=1, le=100)

    @property
    def origins(self) -> set[str]:
        return {x.strip().rstrip("/") for x in self.allowed_origins.split(",") if x.strip()}
