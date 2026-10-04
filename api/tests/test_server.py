"""Testes da API V2 (server/): sessões, estado, histórico, envio de base e explicação."""
from __future__ import annotations

import json
import os
import sqlite3
import tempfile
from pathlib import Path

os.environ["PET_SESSIONS_DIR"] = tempfile.mkdtemp(prefix="pet-sessions-test-")
os.environ.pop("PET_LLM_BASE_URL", None)

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from server import explain as explain_module  # noqa: E402
from server.main import app, settings  # noqa: E402
from server.settings import Settings  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
client = TestClient(app)


def new_session() -> str:
    response = client.post("/api/sessions")
    assert response.status_code == 201
    return response.json()["session_id"]


def test_health_reports_engine_and_llm_off():
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["llm"] is False


@pytest.mark.parametrize("scenario", ["oficial", "sintetico"])
def test_demo_base_matches_front_fixture(scenario):
    api = client.get(f"/api/bases/{scenario}").json()
    fixture = json.loads((ROOT / "web" / "src" / "data" / f"{scenario}.json").read_text())
    assert len(api["recomendacoes"]) == len(fixture["recomendacoes"]) == 120
    pairs = zip(api["recomendacoes"], fixture["recomendacoes"])
    assert all(a["id"] == b["id"] and a["acao"] == b["acao"] and a["preco_sugerido"] == b["preco_sugerido"] for a, b in pairs)


def test_unknown_scenario_is_rejected():
    assert client.get("/api/bases/qualquer").status_code == 422


def test_sessions_are_isolated():
    a, b = new_session(), new_session()
    assert client.put(f"/api/sessions/{a}/state", json={"version": 0, "state": {"decisoes": [1]}}).status_code == 200
    assert client.get(f"/api/sessions/{b}/state").json()["state"] is None
    assert client.get(f"/api/sessions/{a}/state").json()["state"] == {"decisoes": [1]}


def test_state_uses_optimistic_versioning():
    sid = new_session()
    assert client.put(f"/api/sessions/{sid}/state", json={"version": 0, "state": {"n": 1}}).json()["version"] == 1
    conflict = client.put(f"/api/sessions/{sid}/state", json={"version": 0, "state": {"n": 2}})
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["current"] == 1
    assert client.put(f"/api/sessions/{sid}/state", json={"version": 1, "state": {"n": 2}}).json()["version"] == 2


def test_unknown_or_malformed_session_returns_404():
    assert client.get("/api/sessions/nao-existe-mas-tem-tamanho/state").status_code == 404
    assert client.get("/api/sessions/..%2F..%2Fetc/state").status_code == 404


def test_event_chain_detects_tampering():
    sid = new_session()
    for text in ("aprovou PP-0001", "vetou PP-0002", "trocou a fórmula"):
        assert client.post(f"/api/sessions/{sid}/events", json={"author": "Safira", "profile": "gestor", "kind": "decisão", "text": text}).status_code == 201
    assert client.get(f"/api/sessions/{sid}/events/verify").json() == {"valid": True, "events": 3, "broken_at": None}
    with sqlite3.connect(settings.sessions_dir / sid / "session.sqlite") as con:
        con.execute("UPDATE events SET text = 'rejeitou PP-0001' WHERE seq = 1")
    verdict = client.get(f"/api/sessions/{sid}/events/verify").json()
    assert verdict["valid"] is False and verdict["broken_at"] == 1


def test_event_validation_rejects_unknown_profile():
    sid = new_session()
    response = client.post(f"/api/sessions/{sid}/events", json={"author": "x", "profile": "admin", "kind": "k", "text": "t"})
    assert response.status_code == 422


def test_upload_requires_manager_and_valid_workbook():
    sid = new_session()
    official = (ROOT / "data" / "base-oficial.xlsx").read_bytes()
    files = {"file": ("base.xlsx", official, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    assert client.post(f"/api/sessions/{sid}/upload", files=files, headers={"X-Profile": "analista"}).status_code == 403
    bad = {"file": ("base.xlsx", b"nao e planilha", "application/octet-stream")}
    assert client.post(f"/api/sessions/{sid}/upload", files=bad, headers={"X-Profile": "gestor"}).status_code == 422
    ok = client.post(f"/api/sessions/{sid}/upload", files=files, headers={"X-Profile": "gestor"})
    assert ok.status_code == 201
    assert ok.json()["cenario"] == "enviada" and len(ok.json()["recomendacoes"]) == 120
    assert client.get(f"/api/sessions/{sid}/upload").status_code == 200
    assert client.get(f"/api/sessions/{sid}/events").json()[0]["kind"] == "base"


def test_upload_rejects_wrong_extension():
    sid = new_session()
    files = {"file": ("base.csv", b"a;b", "text/csv")}
    response = client.post(f"/api/sessions/{sid}/upload", files=files, headers={"X-Profile": "gestor"})
    assert response.status_code == 422 and "xlsx" in response.json()["detail"]


FACTS = ["O preço atual (R$ 81,69) está 1,8% acima da mediana do mercado (R$ 80,28).", "A margem hoje é 30,8%, acima da mínima de 25,0%."]


def test_explain_falls_back_without_llm():
    body = client.post("/api/explain", json={"product": "Tapete", "channel": "Loja física", "action": "MANTER", "facts": FACTS}).json()
    assert body["source"] == "deterministic"
    assert "81,69" in body["text"]


def test_faithfulness_rejects_invented_numbers():
    assert explain_module.faithful("Manter em R$ 81,69, margem de 30,8%.", FACTS)
    assert not explain_module.faithful("Manter em R$ 79,90 para ganhar 3% de volume.", FACTS)


class FakeResponse:
    def __init__(self, content):
        self._content = content

    def raise_for_status(self):
        return None

    def json(self):
        return {"choices": [{"message": {"content": self._content}}]}


def test_llm_answer_with_invented_number_is_discarded(monkeypatch):
    cfg = Settings(llm_base_url="http://llm.local")
    monkeypatch.setattr(httpx, "post", lambda *a, **k: FakeResponse("Baixe para R$ 75,00 e venda 20% mais."))
    out = explain_module.explain("Tapete", "Loja física", "MANTER", FACTS, cfg)
    assert out["source"] == "deterministic" and "fora dos fatos" in out["reason"]


def test_llm_faithful_answer_is_used(monkeypatch):
    cfg = Settings(llm_base_url="http://llm.local")
    monkeypatch.setattr(httpx, "post", lambda *a, **k: FakeResponse("Manter em R$ 81,69: está 1,8% acima do mercado e com margem de 30,8%."))
    out = explain_module.explain("Tapete", "Loja física", "MANTER", FACTS, cfg)
    assert out["source"] == "llm"


def test_llm_offline_falls_back(monkeypatch):
    cfg = Settings(llm_base_url="http://llm.local")

    def boom(*a, **k):
        raise httpx.ConnectError("offline")

    monkeypatch.setattr(httpx, "post", boom)
    out = explain_module.explain("Tapete", "Loja física", "MANTER", FACTS, cfg)
    assert out["source"] == "deterministic"


def test_concurrent_events_keep_the_chain_valid():
    """Eventos simultâneos (o front manda dois no mesmo instante) não podem quebrar a cadeia."""
    from concurrent.futures import ThreadPoolExecutor

    sid = new_session()
    body = {"author": "Safira", "profile": "gestor", "kind": "decisão", "text": "evento"}
    with ThreadPoolExecutor(max_workers=10) as pool:
        codes = list(pool.map(lambda i: client.post(f"/api/sessions/{sid}/events", json={**body, "text": f"evento {i}"}).status_code, range(20)))
    assert codes == [201] * 20
    assert client.get(f"/api/sessions/{sid}/events/verify").json() == {"valid": True, "events": 20, "broken_at": None}


def test_concurrent_state_writes_accept_only_one_per_version():
    from concurrent.futures import ThreadPoolExecutor

    sid = new_session()
    with ThreadPoolExecutor(max_workers=10) as pool:
        codes = list(pool.map(lambda i: client.put(f"/api/sessions/{sid}/state", json={"version": 0, "state": {"n": i}}).status_code, range(10)))
    assert codes.count(200) == 1 and codes.count(409) == 9


def test_oversized_body_is_rejected_before_reading():
    sid = new_session()
    response = client.put(f"/api/sessions/{sid}/state", content=b"x" * 10, headers={"Content-Type": "application/json", "Content-Length": str(4 * 1024 * 1024)})
    assert response.status_code == 413
