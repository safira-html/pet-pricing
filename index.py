"""Entrada da API na Vercel (runtime Python): expõe o FastAPI de api/server.

A Vercel procura um objeto `app` em index.py na raiz do projeto.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "api"))

from server.main import app  # noqa: E402,F401
