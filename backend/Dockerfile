# ---------- Builder ----------
FROM python:3.13-slim AS builder

# Install git only for dependency build
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml README.md ./

COPY . .

# Upgrade pip and install dependencies into custom prefix
RUN pip install --upgrade pip \
    && pip install --no-cache-dir --prefix=/install .


# ---------- Runtime ----------
FROM python:3.13-slim

WORKDIR /app

# Copy installed packages
COPY --from=builder /install /usr/local

# Copy app code
COPY . .

ENV PYTHONUNBUFFERED=1

ENV PORT=8000

# Get the build arg for APP_VEERSION
ARG APP_VERSION=unknown
ENV FRAME_TV_VERSION=${APP_VERSION}

EXPOSE 8000

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

CMD ["sh", "-c", "exec gunicorn app:app --bind 0.0.0.0:${PORT} --workers ${GUNICORN_WORKERS:-4} --timeout ${GUNICORN_TIMEOUT:-180}"]
