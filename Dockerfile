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

EXPOSE 8000

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
# Run entrypoint.sh for db migrations, ..
ENTRYPOINT ["/entrypoint.sh"]

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:8000"]