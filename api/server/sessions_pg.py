"""Sessões em Postgres, para hospedagem serverless (ex.: Neon pelo Marketplace da Vercel).

Mesma interface do SessionStore em SQLite. Cada operação de escrita trava a linha da sessão
(SELECT ... FOR UPDATE), então eventos simultâneos não quebram a cadeia de hash e escritas
concorrentes de estado respeitam a versão.
"""
from __future__ import annotations

import json
import secrets
import time
from dataclasses import dataclass, field

import psycopg
from psycopg.rows import dict_row

from .sessions import GENESIS, SESSION_ID, SessionNotFound, VersionConflict, event_hash, now_iso

SCHEMA = """
CREATE TABLE IF NOT EXISTS pp_sessions (id TEXT PRIMARY KEY, last_used DOUBLE PRECISION NOT NULL);
CREATE TABLE IF NOT EXISTS pp_state (
  session_id TEXT PRIMARY KEY REFERENCES pp_sessions(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pp_events (
  seq BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES pp_sessions(id) ON DELETE CASCADE,
  at TEXT NOT NULL, author TEXT NOT NULL, profile TEXT NOT NULL, kind TEXT NOT NULL,
  text TEXT NOT NULL, rec_id TEXT, prev_hash TEXT NOT NULL, hash TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS pp_events_session ON pp_events (session_id, seq);
CREATE TABLE IF NOT EXISTS pp_uploads (
  session_id TEXT PRIMARY KEY REFERENCES pp_sessions(id) ON DELETE CASCADE,
  filename TEXT NOT NULL, sha256 TEXT NOT NULL, payload TEXT NOT NULL, uploaded_at TEXT NOT NULL);
"""


@dataclass
class PostgresSessionStore:
    dsn: str
    ttl_hours: float = 24
    _ready: bool = field(default=False, init=False)
    _last_cleanup: float = field(default=0.0, init=False)

    def _connect(self) -> psycopg.Connection:
        # prepare_threshold=None: compatível com o pooler (PgBouncer) do Neon em modo transação.
        con = psycopg.connect(self.dsn, row_factory=dict_row, connect_timeout=10, prepare_threshold=None)
        if not self._ready:
            with con.transaction():
                con.execute(SCHEMA)
            self._ready = True
        return con

    def _check(self, session_id: str) -> None:
        if not SESSION_ID.match(session_id):
            raise SessionNotFound(session_id)

    def _lock(self, con: psycopg.Connection, session_id: str) -> None:
        """Trava a sessão até o fim da transação e marca o uso; 404 se não existir."""
        self._check(session_id)
        row = con.execute("SELECT id FROM pp_sessions WHERE id = %s FOR UPDATE", (session_id,)).fetchone()
        if not row:
            raise SessionNotFound(session_id)
        con.execute("UPDATE pp_sessions SET last_used = %s WHERE id = %s", (time.time(), session_id))

    def create(self) -> str:
        session_id = secrets.token_urlsafe(24)
        with self._connect() as con, con.transaction():
            con.execute("INSERT INTO pp_sessions (id, last_used) VALUES (%s, %s)", (session_id, time.time()))
        if time.time() - self._last_cleanup > 600:
            self._last_cleanup = time.time()
            self.cleanup()
        return session_id

    def exists(self, session_id: str) -> bool:
        if not SESSION_ID.match(session_id):
            return False
        with self._connect() as con:
            return con.execute("SELECT 1 FROM pp_sessions WHERE id = %s", (session_id,)).fetchone() is not None

    def cleanup(self) -> int:
        limit = time.time() - self.ttl_hours * 3600
        with self._connect() as con, con.transaction():
            return con.execute("DELETE FROM pp_sessions WHERE last_used < %s", (limit,)).rowcount

    def get_state(self, session_id: str) -> dict:
        with self._connect() as con, con.transaction():
            self._lock(con, session_id)
            row = con.execute("SELECT version, body, updated_at FROM pp_state WHERE session_id = %s", (session_id,)).fetchone()
        if not row:
            return {"version": 0, "state": None, "updated_at": None}
        return {"version": row["version"], "state": json.loads(row["body"]), "updated_at": row["updated_at"]}

    def put_state(self, session_id: str, state: dict, expected_version: int) -> int:
        body = json.dumps(state, ensure_ascii=False)
        with self._connect() as con, con.transaction():
            self._lock(con, session_id)
            row = con.execute("SELECT version FROM pp_state WHERE session_id = %s", (session_id,)).fetchone()
            current = row["version"] if row else 0
            if expected_version != current:
                raise VersionConflict(current)
            con.execute(
                "INSERT INTO pp_state (session_id, version, body, updated_at) VALUES (%s, %s, %s, %s) "
                "ON CONFLICT (session_id) DO UPDATE SET version = EXCLUDED.version, body = EXCLUDED.body, updated_at = EXCLUDED.updated_at",
                (session_id, current + 1, body, now_iso()),
            )
        return current + 1

    def append_event(self, session_id: str, author: str, profile: str, kind: str, text: str, rec_id: str | None) -> dict:
        with self._connect() as con, con.transaction():
            self._lock(con, session_id)
            last = con.execute("SELECT hash FROM pp_events WHERE session_id = %s ORDER BY seq DESC LIMIT 1", (session_id,)).fetchone()
            prev_hash = last["hash"] if last else GENESIS
            event = {"at": now_iso(), "author": author, "profile": profile, "kind": kind, "text": text, "rec_id": rec_id}
            event["prev_hash"] = prev_hash
            event["hash"] = event_hash(prev_hash, event)
            row = con.execute(
                "INSERT INTO pp_events (session_id, at, author, profile, kind, text, rec_id, prev_hash, hash) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING seq",
                (session_id, event["at"], author, profile, kind, text, rec_id, prev_hash, event["hash"]),
            ).fetchone()
            event["seq"] = row["seq"]
        return event

    def events(self, session_id: str, limit: int = 500) -> list[dict]:
        with self._connect() as con, con.transaction():
            self._lock(con, session_id)
            rows = con.execute(
                "SELECT seq, at, author, profile, kind, text, rec_id, prev_hash, hash FROM pp_events "
                "WHERE session_id = %s ORDER BY seq DESC LIMIT %s", (session_id, limit)).fetchall()
        return [dict(r) for r in rows]

    def verify_events(self, session_id: str) -> dict:
        with self._connect() as con, con.transaction():
            self._lock(con, session_id)
            rows = [dict(r) for r in con.execute(
                "SELECT seq, at, author, profile, kind, text, rec_id, prev_hash, hash FROM pp_events "
                "WHERE session_id = %s ORDER BY seq", (session_id,)).fetchall()]
        prev = GENESIS
        for index, row in enumerate(rows, start=1):
            if row["prev_hash"] != prev or event_hash(prev, row) != row["hash"]:
                return {"valid": False, "events": len(rows), "broken_at": index}
            prev = row["hash"]
        return {"valid": True, "events": len(rows), "broken_at": None}

    def save_upload(self, session_id: str, filename: str, sha256: str, payload: dict) -> None:
        with self._connect() as con, con.transaction():
            self._lock(con, session_id)
            con.execute(
                "INSERT INTO pp_uploads (session_id, filename, sha256, payload, uploaded_at) VALUES (%s, %s, %s, %s, %s) "
                "ON CONFLICT (session_id) DO UPDATE SET filename = EXCLUDED.filename, sha256 = EXCLUDED.sha256, "
                "payload = EXCLUDED.payload, uploaded_at = EXCLUDED.uploaded_at",
                (session_id, filename, sha256, json.dumps(payload, ensure_ascii=False), now_iso()),
            )

    def upload(self, session_id: str) -> dict | None:
        with self._connect() as con, con.transaction():
            self._lock(con, session_id)
            row = con.execute("SELECT payload FROM pp_uploads WHERE session_id = %s", (session_id,)).fetchone()
        return json.loads(row["payload"]) if row else None
