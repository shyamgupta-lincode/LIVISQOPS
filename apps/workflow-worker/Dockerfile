FROM factoryops-api:latest
RUN pip install --no-cache-dir temporalio==1.7.1
WORKDIR /app
COPY apps/workflow-worker/src/workflow_worker /app/apps/workflow-worker/src/workflow_worker
ENV PYTHONPATH=/app/apps/workflow-worker/src:/app/apps/api/src:/app/packages/domain/src:/app/packages/config/src
CMD ["python", "-m", "workflow_worker.main"]
