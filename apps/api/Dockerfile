FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl build-essential \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY packages/config/src/factoryops_config /app/packages/config/src/factoryops_config
COPY packages/domain/src/factoryops_domain /app/packages/domain/src/factoryops_domain
COPY packages/config/pyproject.toml /app/packages/config/pyproject.toml
COPY packages/domain/pyproject.toml /app/packages/domain/pyproject.toml
COPY apps/api/src/factoryops_api /app/apps/api/src/factoryops_api
COPY apps/api/requirements.txt /app/apps/api/requirements.txt
COPY db /app/db
COPY schemas /app/schemas
COPY prompts /app/prompts
RUN pip install --no-cache-dir -U pip \
 && pip install --no-cache-dir -r /app/apps/api/requirements.txt
ENV PYTHONPATH=/app/apps/api/src:/app/packages/domain/src:/app/packages/config/src
EXPOSE 8000
CMD ["uvicorn", "factoryops_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
