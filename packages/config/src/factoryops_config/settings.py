from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Brand(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="")
    product_name: str = Field(default="FactoryOps", alias="PRODUCT_NAME")
    product_accent: str = Field(default="#0B6E4F", alias="PRODUCT_ACCENT")

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://factoryops:factoryops_dev_change_me@postgres:5432/factoryops"
    kafka_bootstrap_servers: str = "redpanda:9092"
    clickhouse_host: str = "clickhouse"
    clickhouse_port: int = 8123
    clickhouse_db: str = "factoryops"
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "factoryops"
    minio_secret_key: str = "factoryops_minio_change_me"
    minio_bucket_raw: str = "fo-raw"
    minio_bucket_evidence: str = "fo-evidence"
    minio_bucket_models: str = "fo-models"
    minio_bucket_docs: str = "fo-docs"
    temporal_host: str = "temporal:7233"
    mqtt_host: str = "mosquitto"
    mqtt_port: int = 1883
    agent_provider: str = "mock"
    openai_api_key: str = ""
    openai_model: str = "gpt-4.1-mini"
    auth_mode: str = "oidc_with_demo_fallback"
    demo_password: str = "demo"
    oidc_issuer: str = "http://localhost:8080/auth/realms/factoryops"
    oidc_audience: str = "factoryops-api"
    session_secret: str = "dev"
    product_name: str = "FactoryOps"
    product_accent: str = "#0B6E4F"
    log_level: str = "INFO"
    # Base URL for seeded local connector-sim targets (compose: http://api:8000).
    connector_sim_base_url: str = "http://127.0.0.1:8000"

@lru_cache
def get_settings() -> Settings:
    return Settings()
