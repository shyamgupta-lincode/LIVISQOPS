FROM factoryops-api:latest
RUN pip install --no-cache-dir paho-mqtt==2.1.0
WORKDIR /app
COPY apps/simulator/src/simulator /app/apps/simulator/src/simulator
ENV PYTHONPATH=/app/apps/simulator/src:/app/apps/api/src:/app/packages/domain/src:/app/packages/config/src
CMD ["python", "-m", "simulator.main"]
