FROM python:3.13-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/pyproject.toml ./

COPY . .

RUN pip install --upgrade pip \
    && pip install --no-cache-dir --prefix=/install ./backend


FROM python:3.13-slim

WORKDIR /app

COPY --from=builder /install /usr/local

COPY backend/ .
COPY frontend/build/client/ /frontend/build/client/

ENV PYTHONUNBUFFERED=1
ENV PORT=8000

ARG APP_VERSION=unknown
ENV FRAME_TV_VERSION=${APP_VERSION}

EXPOSE 8000

COPY backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

CMD ["sh", "-c", "exec gunicorn app:app --bind 0.0.0.0:${PORT} --workers ${GUNICORN_WORKERS:-4} --timeout ${GUNICORN_TIMEOUT:-180}"]
