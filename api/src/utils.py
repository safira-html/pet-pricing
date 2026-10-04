from __future__ import annotations

import hashlib
import json
import math
import re
import unicodedata
from datetime import date, datetime, time
from decimal import Decimal, ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Sao_Paulo")
CENT = Decimal("0.01")


def now():
    return datetime.now(TZ)


def timestamp():
    return now().isoformat(timespec="seconds")


def normalize(value):
    raw = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", raw.lower()).strip("_")


def missing(value):
    return value is None or (isinstance(value, float) and math.isnan(value)) or str(value) in ("NaT", "<NA>", "nan", "")


def D(value):
    if missing(value):
        raise ValueError("Valor numérico ausente.")
    result = Decimal(str(value))
    if not result.is_finite():
        raise ValueError("Valor numérico não finito.")
    return result


def money(value, mode="nearest"):
    return D(value).quantize(CENT, rounding={"nearest": ROUND_HALF_UP, "up": ROUND_CEILING, "down": ROUND_FLOOR}[mode])


def as_date(value):
    if missing(value):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def as_datetime(value):
    result = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
    return result.replace(tzinfo=TZ) if result.tzinfo is None else result.astimezone(TZ)


def end_of_day(value):
    return datetime.combine(as_date(value), time(23, 59, 59), TZ)


def active_on(item, reference):
    ref = as_date(reference)
    start, end = as_date(item.get("inicio_vigencia")), as_date(item.get("fim_vigencia"))
    return bool(item.get("ativa", True)) and (start is None or start <= ref) and (end is None or end >= ref)


def validity(item, reference):
    if not item.get("ativa", True):
        return "Inativa"
    if as_date(item.get("inicio_vigencia")) and as_date(item["inicio_vigencia"]) > as_date(reference):
        return "Futura"
    if as_date(item.get("fim_vigencia")) and as_date(item["fim_vigencia"]) < as_date(reference):
        return "Expirada"
    return "Vigente"


def clean(value):
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if missing(value):
        return None
    if hasattr(value, "item"):
        return value.item()
    return value


def dumps(value):
    return json.dumps(clean(value), ensure_ascii=False, sort_keys=True, allow_nan=False)


def fingerprint(value):
    return hashlib.sha256(dumps(value).encode()).hexdigest()


def brl(value):
    if missing(value):
        return "—"
    return "R$ " + f"{float(value):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
