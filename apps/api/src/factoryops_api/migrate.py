"""Create schema + apply RLS policies (Alembic-compatible entrypoint)."""
from __future__ import annotations
import json
from pathlib import Path
from sqlalchemy import text
from factoryops_api.db import Base, engine, ping
from factoryops_api import models  # noqa: F401

RLS_TABLES = (
    "quality_events", "anomalies", "work_tasks", "audit_entries",
)

def apply_rls() -> None:
    with engine.begin() as conn:
        for t in RLS_TABLES:
            conn.execute(text(f"ALTER TABLE IF EXISTS {t} ENABLE ROW LEVEL SECURITY"))
            conn.execute(text(f"DROP POLICY IF EXISTS tenant_site_isolation ON {t}"))
            conn.execute(text(f"""
                CREATE POLICY tenant_site_isolation ON {t}
                USING (
                  current_setting('app.current_site_id', true) IS NULL
                  OR current_setting('app.current_site_id', true) = ''
                  OR site_id::text = current_setting('app.current_site_id', true)
                )
            """))

def export_openapi() -> None:
    try:
        from factoryops_api.main import app
        out = Path(__file__).resolve().parents[4] / "schemas" / "openapi" / "openapi.json"
        # In container layout: /app/schemas/openapi
        candidates = [
            Path("/app/schemas/openapi/openapi.json"),
            out,
            Path("schemas/openapi/openapi.json"),
        ]
        for p in candidates:
            try:
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(json.dumps(app.openapi(), indent=2))
                print("openapi exported", p)
                return
            except OSError:
                continue
    except Exception as e:
        print("openapi export skipped:", e)

def main():
    ping()
    Base.metadata.create_all(bind=engine)
    apply_rls()
    export_openapi()
    print("migrations applied (create_all + rls)")

if __name__ == "__main__":
    main()
