"""Explicação em linguagem natural com LLM local opcional.

O preço nunca vem do LLM: ele só reescreve os fatos que o motor já calculou.
Toda resposta passa por uma checagem de fidelidade: qualquer número que não
esteja nos fatos derruba a resposta e volta o texto determinístico.
"""
from __future__ import annotations

import re

import httpx

from .settings import Settings

NUMBER = re.compile(r"\d+(?:[.,]\d+)*")
SYSTEM_PROMPT = (
    "Você explica recomendações de preço para um analista de pricing de varejo pet. "
    "Escreva em português do Brasil, em no máximo 3 frases curtas, tom institucional e direto. "
    "Use apenas os fatos fornecidos. Não invente números, concorrentes, datas nem motivos. "
    "Copie os números exatamente como aparecem nos fatos."
)


def _numbers(text: str) -> set[str]:
    return {n.rstrip(".,") for n in NUMBER.findall(text)}


def faithful(answer: str, facts: list[str]) -> bool:
    """Todo número citado na resposta precisa aparecer nos fatos."""
    allowed = _numbers(" ".join(facts))
    return _numbers(answer) <= allowed


def fallback(facts: list[str]) -> str:
    return " ".join(f.strip() for f in facts if f.strip())


def explain(product: str, channel: str, action: str, facts: list[str], settings: Settings) -> dict:
    facts = [f for f in facts if f and f.strip()][:12]
    if not facts:
        return {"text": "", "source": "deterministic", "reason": "sem fatos"}
    if not settings.llm_base_url:
        return {"text": fallback(facts), "source": "deterministic", "reason": "LLM local desligado"}
    user = f"Produto: {product} · Canal: {channel} · Recomendação: {action}\nFatos:\n" + "\n".join(f"- {f}" for f in facts)
    try:
        response = httpx.post(
            f"{settings.llm_base_url.rstrip('/')}/v1/chat/completions",
            json={"model": settings.llm_model, "temperature": 0.1, "max_tokens": 220,
                  "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}]},
            timeout=settings.llm_timeout_seconds,
        )
        response.raise_for_status()
        answer = response.json()["choices"][0]["message"]["content"].strip()
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
        return {"text": fallback(facts), "source": "deterministic", "reason": f"LLM indisponível ({type(exc).__name__})"}
    if not answer or not faithful(answer, facts):
        return {"text": fallback(facts), "source": "deterministic", "reason": "resposta do LLM citou número fora dos fatos"}
    return {"text": answer, "source": "llm", "reason": None}
