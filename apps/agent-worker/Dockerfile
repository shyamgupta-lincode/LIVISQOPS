FROM factoryops-api:latest
WORKDIR /app
COPY apps/agent-worker/src/agent_worker /app/apps/agent-worker/src/agent_worker
COPY prompts /app/prompts
ENV PYTHONPATH=/app/apps/agent-worker/src:/app/apps/api/src:/app/packages/domain/src:/app/packages/config/src
CMD ["python", "-m", "agent_worker.main"]
