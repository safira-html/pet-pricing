# API do Pet Pricing para o Hugging Face Spaces (SDK Docker, CPU Basic gratuito).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PET_DATA_DIR=/app/data \
    PET_SESSIONS_DIR=/tmp/pet-pricing-sessions

# O Spaces roda o contêiner com o usuário 1000.
RUN useradd -m -u 1000 user
WORKDIR /app/api

COPY api/requirements-api.txt ./
RUN pip install --no-cache-dir -r requirements-api.txt

COPY --chown=user api/src ./src
COPY --chown=user api/server ./server
COPY --chown=user data /app/data

USER user
EXPOSE 7860
# PET_ALLOWED_ORIGINS (URL do front na Vercel) é definido nas variáveis do Space.
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "7860", "--proxy-headers"]
