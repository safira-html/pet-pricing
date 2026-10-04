"""Configuração da API por variáveis de ambiente (nenhum segredo é obrigatório)."""
from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[2]


def _list(name: str, default: str) -> list[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("PET_DATA_DIR", APP_ROOT / "data")))
    sessions_dir: Path = field(default_factory=lambda: Path(os.getenv("PET_SESSIONS_DIR", Path(tempfile.gettempdir()) / "pet-pricing-sessions")))
    # Sessões sem uso por mais que isso são apagadas (a demo pública não guarda dado de ninguém).
    session_ttl_hours: float = field(default_factory=lambda: float(os.getenv("PET_SESSION_TTL_HOURS", "24")))
    allowed_origins: list[str] = field(default_factory=lambda: _list("PET_ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"))
    max_upload_mb: float = field(default_factory=lambda: float(os.getenv("PET_MAX_UPLOAD_MB", "5")))
    rate_limit_per_minute: int = field(default_factory=lambda: int(os.getenv("PET_RATE_LIMIT_PER_MINUTE", "240")))
    # Servidor local compatível com a API do OpenAI (ex.: llama-server). Vazio = explicação sem LLM.
    llm_base_url: str = field(default_factory=lambda: os.getenv("PET_LLM_BASE_URL", ""))
    llm_model: str = field(default_factory=lambda: os.getenv("PET_LLM_MODEL", "local"))
    llm_timeout_seconds: float = field(default_factory=lambda: float(os.getenv("PET_LLM_TIMEOUT_SECONDS", "20")))


def get_settings() -> Settings:
    return Settings()
