"""Initial schema note + RLS policies for tenant/site scoped tables.

Revision ID: 0001_initial_rls
Revises:
Create Date: 2026-08-09
"""
from alembic import op

revision = "0001_initial_rls"
down_revision = None
branch_labels = None
depends_on = None

RLS_SQL = """
-- Enable RLS on site-scoped operational tables (idempotent).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'quality_events','anomalies','work_tasks','audit_entries'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_site_isolation ON %I', t);
      -- App sets app.current_site_id; when unset, allow (service role / migrate).
      EXECUTE format($f$
        CREATE POLICY tenant_site_isolation ON %I
        USING (
          current_setting('app.current_site_id', true) IS NULL
          OR current_setting('app.current_site_id', true) = ''
          OR site_id::text = current_setting('app.current_site_id', true)
        )
      $f$, t);
    END IF;
  END LOOP;
END $$;
"""

def upgrade() -> None:
    op.execute(RLS_SQL)

def downgrade() -> None:
    op.execute("""
    DO $$
    DECLARE t text;
    BEGIN
      FOREACH t IN ARRAY ARRAY[
        'quality_events','anomalies','work_tasks','audit_entries'
      ]
      LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
          EXECUTE format('DROP POLICY IF EXISTS tenant_site_isolation ON %I', t);
          EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', t);
        END IF;
      END LOOP;
    END $$;
    """)
