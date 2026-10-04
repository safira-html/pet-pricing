"""Mesmos contratos do armazenamento SQLite, rodando contra um Postgres real.

Roda só quando PET_TEST_DATABASE_URL aponta para um banco de teste (ex.: Postgres local).
"""
from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor

import pytest

DSN = os.getenv("PET_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="PET_TEST_DATABASE_URL não definido")


@pytest.fixture()
def store():
    from server.sessions_pg import PostgresSessionStore

    return PostgresSessionStore(DSN, ttl_hours=24)


def test_state_versioning_and_isolation(store):
    from server.sessions import VersionConflict

    a, b = store.create(), store.create()
    assert store.put_state(a, {"n": 1}, 0) == 1
    with pytest.raises(VersionConflict):
        store.put_state(a, {"n": 2}, 0)
    assert store.get_state(b)["state"] is None
    assert store.get_state(a)["state"] == {"n": 1}


def test_concurrent_events_keep_chain_valid(store):
    sid = store.create()
    with ThreadPoolExecutor(max_workers=10) as pool:
        list(pool.map(lambda i: store.append_event(sid, "Safira", "gestor", "decisão", f"evento {i}", None), range(20)))
    assert store.verify_events(sid) == {"valid": True, "events": 20, "broken_at": None}


def test_concurrent_state_writes_accept_one(store):
    from server.sessions import VersionConflict

    sid = store.create()

    def write(i):
        try:
            store.put_state(sid, {"n": i}, 0)
            return "ok"
        except VersionConflict:
            return "conflict"

    with ThreadPoolExecutor(max_workers=10) as pool:
        results = list(pool.map(write, range(10)))
    assert results.count("ok") == 1


def test_upload_roundtrip_and_unknown_session(store):
    from server.sessions import SessionNotFound

    sid = store.create()
    store.save_upload(sid, "base.xlsx", "abc", {"recomendacoes": [1, 2]})
    assert store.upload(sid) == {"recomendacoes": [1, 2]}
    assert not store.exists("nao-existe-mas-tem-tamanho")
    with pytest.raises(SessionNotFound):
        store.get_state("nao-existe-mas-tem-tamanho")
