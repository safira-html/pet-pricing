"""API do Pet Pricing V2.

Roda o motor do Allan (src/) sem alterar a lógica de preço e acrescenta o que a
demo pública precisa: sessão isolada por visitante, envio de planilha pelo gestor,
estado salvo com versão, histórico encadeado por hash e explicação com LLM local opcional.

Uso local: uvicorn server.main:app --reload --port 8000
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from functools import lru_cache
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from src.recommendation_service import ENGINE_VERSION

from .explain import explain
from .payload import build_payload
from .sessions import SessionNotFound, SessionStore, VersionConflict
from .settings import Settings, get_settings

Scenario = Literal["oficial", "sintetico"]
Profile = Literal["analista", "gestor", "visitante", "sistema"]
MAX_STATE_BYTES = 2 * 1024 * 1024

settings = get_settings()
store = SessionStore(settings.sessions_dir, settings.session_ttl_hours)
@asynccontextmanager
async def lifespan(_: FastAPI):
    """Calcula as bases de demonstração em segundo plano, para o primeiro visitante não esperar."""
    threading.Thread(target=lambda: [demo_base("oficial"), demo_base("sintetico")], daemon=True).start()
    yield


app = FastAPI(title="Pet Pricing API", version="2.0.0", docs_url="/api/docs", openapi_url="/api/openapi.json", lifespan=lifespan)
_hits: dict[str, deque] = defaultdict(deque)
MAX_BODY_BYTES = 3 * 1024 * 1024


def client_ip(request: Request) -> str:
    """IP real: a última entrada do X-Forwarded-For é a que o proxy do Hugging Face acrescenta."""
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "?"


@app.middleware("http")
async def guard(request: Request, call_next):
    """Limite por IP e de tamanho do corpo, antes de ler qualquer coisa."""
    limit = int(settings.max_upload_mb * 1024 * 1024) + 64 * 1024 if request.url.path.endswith("/upload") else MAX_BODY_BYTES
    length = request.headers.get("content-length")
    if length and length.isdigit() and int(length) > limit:
        return JSONResponse({"detail": "Arquivo ou requisição grande demais."}, status_code=413)
    ip = client_ip(request)
    now = time.monotonic()
    if len(_hits) > 5000:  # descarta IPs sem uso recente para a memória não crescer
        for key in [k for k, w in _hits.items() if not w or now - w[-1] > 60]:
            _hits.pop(key, None)
    window = _hits[ip]
    while window and now - window[0] > 60:
        window.popleft()
    if len(window) >= settings.rate_limit_per_minute:
        return JSONResponse({"detail": "Muitas requisições. Tente de novo em um minuto."}, status_code=429)
    window.append(now)
    return await call_next(request)


# CORS por último = camada mais externa: até o 429 e o 413 saem com o cabeçalho certo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type", "X-Profile"],
)


def config() -> Settings:
    return settings


def require_session(session_id: str) -> str:
    if not store.exists(session_id):
        raise HTTPException(404, "Sessão não encontrada ou expirada. Recarregue a página para começar outra.")
    return session_id


@lru_cache(maxsize=2)
def demo_base(scenario: Scenario) -> dict:
    """As bases de demonstração são determinísticas: calcula uma vez por processo."""
    if scenario == "oficial":
        path = settings.data_dir / "base-oficial.xlsx"
        synthetic: set[str] = set()
    else:
        path = settings.data_dir / "cenarios-sinteticos.xlsx"
        manifest = json.loads((settings.data_dir / "cenarios-sinteticos.json").read_text())
        synthetic = {item["sku"] for item in manifest["skus"]}
    payload = build_payload(path.read_bytes(), path.name, scenario, synthetic)
    payload.pop("avisos_importacao", None)
    return payload


class StateIn(BaseModel):
    version: int = Field(ge=0)
    state: dict


class EventIn(BaseModel):
    author: str = Field(min_length=1, max_length=80)
    profile: Profile
    kind: str = Field(min_length=1, max_length=40)
    text: str = Field(min_length=1, max_length=1000)
    rec_id: str | None = Field(default=None, max_length=120)


class ExplainIn(BaseModel):
    product: str = Field(max_length=160)
    channel: str = Field(max_length=40)
    action: str = Field(max_length=20)
    facts: list[Annotated[str, Field(max_length=400)]] = Field(max_length=12)


@app.get("/api/health")
def health(cfg: Settings = Depends(config)):
    return {"status": "ok", "engine_version": ENGINE_VERSION, "llm": bool(cfg.llm_base_url)}


@app.get("/api/bases/{scenario}")
def get_base(scenario: Scenario):
    return demo_base(scenario)


@app.post("/api/sessions", status_code=201)
def create_session():
    return {"session_id": store.create()}


@app.get("/api/sessions/{session_id}")
def get_session(session_id: str = Depends(require_session)):
    return {"session_id": session_id, "has_upload": store.upload(session_id) is not None}


@app.get("/api/sessions/{session_id}/state")
def get_state(session_id: str = Depends(require_session)):
    return store.get_state(session_id)


@app.put("/api/sessions/{session_id}/state")
def put_state(body: StateIn, session_id: str = Depends(require_session)):
    if len(json.dumps(body.state)) > MAX_STATE_BYTES:
        raise HTTPException(413, "Estado grande demais para a demo.")
    try:
        return {"version": store.put_state(session_id, body.state, body.version)}
    except VersionConflict as exc:
        raise HTTPException(409, {"message": str(exc), "current": exc.current}) from exc


@app.post("/api/sessions/{session_id}/events", status_code=201)
def post_event(body: EventIn, session_id: str = Depends(require_session)):
    return store.append_event(session_id, body.author, body.profile, body.kind, body.text, body.rec_id)


@app.get("/api/sessions/{session_id}/events")
def get_events(session_id: str = Depends(require_session)):
    return store.events(session_id)


@app.get("/api/sessions/{session_id}/events/verify")
def verify_events(session_id: str = Depends(require_session)):
    return store.verify_events(session_id)


@app.get("/api/sessions/{session_id}/upload")
def get_upload(session_id: str = Depends(require_session)):
    payload = store.upload(session_id)
    if payload is None:
        raise HTTPException(404, "Nenhuma base enviada nesta sessão.")
    return payload


@app.post("/api/sessions/{session_id}/upload", status_code=201)
def upload_base(  # síncrono de propósito: o FastAPI roda em thread e não trava as outras requisições
    file: UploadFile = File(...),
    session_id: str = Depends(require_session),
    x_profile: str = Header(default="visitante"),
    cfg: Settings = Depends(config),
):
    # Na demo o perfil é declarado; em produção viria do login corporativo.
    if x_profile != "gestor":
        raise HTTPException(403, "Só o gestor envia uma base nova.")
    raw = file.file.read(int(cfg.max_upload_mb * 1024 * 1024) + 1)
    if len(raw) > cfg.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"Envie um arquivo de até {cfg.max_upload_mb:g} MB.")
    filename = file.filename or "base.xlsx"
    try:
        payload = build_payload(raw, filename, "enviada")
    except ValueError as exc:  # mensagens do validador do motor, em português
        raise HTTPException(422, str(exc)[:300]) from exc
    except Exception as exc:  # planilha fora do modelo quebra em pontos diferentes do pandas/openpyxl
        raise HTTPException(422, "Não consegui ler a planilha. Use o mesmo modelo de abas e colunas da base do desafio.") from exc
    sha = hashlib.sha256(raw).hexdigest()
    store.save_upload(session_id, filename, sha, payload)
    store.append_event(session_id, "Sistema", "sistema", "base", f"Base “{filename}” enviada e processada pelo motor ({len(payload['recomendacoes'])} itens, sha256 {sha[:12]}…).", None)
    return payload


@app.post("/api/explain")
def post_explain(body: ExplainIn, cfg: Settings = Depends(config)):
    return explain(body.product, body.channel, body.action, body.facts, cfg)


@app.exception_handler(SessionNotFound)
async def session_not_found(_: Request, __: SessionNotFound):
    return JSONResponse({"detail": "Sessão não encontrada ou expirada."}, status_code=404)
