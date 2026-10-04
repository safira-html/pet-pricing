"""Sessões isoladas por visitante, cada uma com seu próprio SQLite.

Guarda o estado do front (decisões, regras, agendamentos, resultados) com versão
para evitar sobrescrita, a base enviada pelo gestor e um histórico de eventos
encadeado por hash: alterar ou apagar um evento antigo quebra a cadeia e é detectável.
"""
from __future__ import annotations

import hashlib
import json
import re
import secrets
import shutil
import sqlite3
import time
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

SESSION_ID = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
GENESIS = "0" * 64

SCHEMA = """
CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, body TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  author TEXT NOT NULL,
  profile TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  rec_id TEXT,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS uploads (id INTEGER PRIMARY KEY CHECK (id = 1), filename TEXT NOT NULL, sha256 TEXT NOT NULL, payload TEXT NOT NULL, uploaded_at TEXT NOT NULL);
"""


class SessionNotFound(LookupError):
    pass


class VersionConflict(ValueError):
    def __init__(self, current: int):
        super().__init__(f"Estado mudou em outra aba (versão {current}).")
        self.current = current


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def event_hash(prev_hash: str, event: dict) -> str:
    canonical = json.dumps({k: event[k] for k in ("at", "author", "profile", "kind", "text", "rec_id")}, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(f"{prev_hash}|{canonical}".encode()).hexdigest()


@dataclass
class SessionStore:
    root: Path
    ttl_hours: float = 24

    def __post_init__(self):
        self.root.mkdir(parents=True, exist_ok=True)

    def _dir(self, session_id: str) -> Path:
        if not SESSION_ID.match(session_id):
            raise SessionNotFound(session_id)
        return self.root / session_id

    def _connect(self, session_id: str) -> sqlite3.Connection:
        folder = self._dir(session_id)
        if not folder.exists():
            raise SessionNotFound(session_id)
        # Autocommit + BEGIN IMMEDIATE explícito: leitura e escrita da mesma operação ficam sob o mesmo lock.
        con = sqlite3.connect(folder / "session.sqlite", timeout=10, isolation_level=None)
        con.row_factory = sqlite3.Row
        (folder / "last_used").write_text(str(time.time()))
        return con

    _last_cleanup: float = 0.0

    def create(self) -> str:
        # Limpeza no máximo a cada 10 minutos, para criar sessão não ficar mais lento com o tempo.
        if time.time() - self._last_cleanup > 600:
            self._last_cleanup = time.time()
            self.cleanup()
        session_id = secrets.token_urlsafe(24)
        folder = self._dir(session_id)
        folder.mkdir()
        with closing(sqlite3.connect(folder / "session.sqlite")) as con:
            con.executescript(SCHEMA)
            con.execute("PRAGMA journal_mode=WAL")
        (folder / "last_used").write_text(str(time.time()))
        return session_id

    def exists(self, session_id: str) -> bool:
        try:
            return self._dir(session_id).exists()
        except SessionNotFound:
            return False

    def cleanup(self) -> int:
        limit = time.time() - self.ttl_hours * 3600
        removed = 0
        for folder in self.root.iterdir():
            marker = folder / "last_used"
            try:
                last = float(marker.read_text()) if marker.exists() else folder.stat().st_mtime
            except (OSError, ValueError):
                last = 0
            if folder.is_dir() and last < limit:
                shutil.rmtree(folder, ignore_errors=True)
                removed += 1
        return removed

    # Estado do front ---------------------------------------------------------
    def get_state(self, session_id: str) -> dict:
        with closing(self._connect(session_id)) as con:
            row = con.execute("SELECT version, body, updated_at FROM state WHERE id = 1").fetchone()
        if not row:
            return {"version": 0, "state": None, "updated_at": None}
        return {"version": row["version"], "state": json.loads(row["body"]), "updated_at": row["updated_at"]}

    def put_state(self, session_id: str, state: dict, expected_version: int) -> int:
        body = json.dumps(state, ensure_ascii=False)
        with closing(self._connect(session_id)) as con:
            con.execute("BEGIN IMMEDIATE")
            try:
                row = con.execute("SELECT version FROM state WHERE id = 1").fetchone()
                current = row["version"] if row else 0
                if expected_version != current:
                    raise VersionConflict(current)
                con.execute(
                    "INSERT INTO state (id, version, body, updated_at) VALUES (1, ?, ?, ?) "
                    "ON CONFLICT(id) DO UPDATE SET version = excluded.version, body = excluded.body, updated_at = excluded.updated_at",
                    (current + 1, body, now_iso()),
                )
                con.execute("COMMIT")
            except BaseException:
                con.execute("ROLLBACK")
                raise
        return current + 1

    # Histórico encadeado -----------------------------------------------------
    def append_event(self, session_id: str, author: str, profile: str, kind: str, text: str, rec_id: str | None) -> dict:
        with closing(self._connect(session_id)) as con:
            con.execute("BEGIN IMMEDIATE")  # sem isso, dois eventos simultâneos usariam o mesmo hash anterior
            try:
                last = con.execute("SELECT hash FROM events ORDER BY seq DESC LIMIT 1").fetchone()
                prev_hash = last["hash"] if last else GENESIS
                event = {"at": now_iso(), "author": author, "profile": profile, "kind": kind, "text": text, "rec_id": rec_id}
                event["prev_hash"] = prev_hash
                event["hash"] = event_hash(prev_hash, event)
                cur = con.execute(
                    "INSERT INTO events (at, author, profile, kind, text, rec_id, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (event["at"], author, profile, kind, text, rec_id, prev_hash, event["hash"]),
                )
                event["seq"] = cur.lastrowid
                con.execute("COMMIT")
            except BaseException:
                con.execute("ROLLBACK")
                raise
        return event

    def events(self, session_id: str, limit: int = 500) -> list[dict]:
        with closing(self._connect(session_id)) as con:
            rows = con.execute("SELECT * FROM events ORDER BY seq DESC LIMIT ?", (limit,)).fetchall()
        return [dict(r) for r in rows]

    def verify_events(self, session_id: str) -> dict:
        with closing(self._connect(session_id)) as con:
            rows = [dict(r) for r in con.execute("SELECT * FROM events ORDER BY seq").fetchall()]
        prev = GENESIS
        for row in rows:
            if row["prev_hash"] != prev or event_hash(prev, row) != row["hash"]:
                return {"valid": False, "events": len(rows), "broken_at": row["seq"]}
            prev = row["hash"]
        return {"valid": True, "events": len(rows), "broken_at": None}

    # Base enviada --------------------------------------------------------------
    def save_upload(self, session_id: str, filename: str, sha256: str, payload: dict) -> None:
        with closing(self._connect(session_id)) as con:
            con.execute(
                "INSERT INTO uploads (id, filename, sha256, payload, uploaded_at) VALUES (1, ?, ?, ?, ?) "
                "ON CONFLICT(id) DO UPDATE SET filename = excluded.filename, sha256 = excluded.sha256, payload = excluded.payload, uploaded_at = excluded.uploaded_at",
                (filename, sha256, json.dumps(payload, ensure_ascii=False), now_iso()),
            )

    def upload(self, session_id: str) -> dict | None:
        with closing(self._connect(session_id)) as con:
            row = con.execute("SELECT payload FROM uploads WHERE id = 1").fetchone()
        return json.loads(row["payload"]) if row else None
