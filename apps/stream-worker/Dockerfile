FROM factoryops-api:latest
WORKDIR /app
COPY apps/stream-worker/src/stream_worker /app/apps/stream-worker/src/stream_worker
ENV PYTHONPATH=/app/apps/stream-worker/src:/app/apps/api/src:/app/packages/domain/src:/app/packages/config/src
CMD ["python", "-m", "stream_worker.main"]
