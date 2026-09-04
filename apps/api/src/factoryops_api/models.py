from __future__ import annotations
from datetime import datetime, timezone
from typing import Any, Optional
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

class Tenant(Base):
    __tablename__ = "tenants"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class Site(Base):
    __tablename__ = "sites"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"))
    name: Mapped[str] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(64))
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")

class Line(Base):
    __tablename__ = "lines"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"))
    name: Mapped[str] = mapped_column(String(200))
    takt_s: Mapped[float] = mapped_column(Float, default=60)

class Cell(Base):
    __tablename__ = "cells"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    line_id: Mapped[str] = mapped_column(ForeignKey("lines.id"))
    name: Mapped[str] = mapped_column(String(200))

class Asset(Base):
    __tablename__ = "assets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    cell_id: Mapped[str] = mapped_column(ForeignKey("cells.id"))
    name: Mapped[str] = mapped_column(String(200))
    asset_type: Mapped[str] = mapped_column(String(64), default="equipment")
    criticality: Mapped[str] = mapped_column(String(32), default="High")
    health_index: Mapped[float] = mapped_column(Float, default=1.0)
    operating_state: Mapped[str] = mapped_column(String(64), default="Running")

class FailureMode(Base):
    __tablename__ = "failure_modes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    code: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(200))
    horizon_hours: Mapped[float] = mapped_column(Float, default=72)
    run_to_failure_history: Mapped[bool] = mapped_column(Boolean, default=False)

class Product(Base):
    __tablename__ = "products"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"))
    name: Mapped[str] = mapped_column(String(200))
    revision: Mapped[str] = mapped_column(String(64), default="A")

class ProductionOrder(Base):
    __tablename__ = "production_orders"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"))
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id"))
    external_id: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="Released")
    qty: Mapped[int] = mapped_column(Integer, default=100)

class Lot(Base):
    __tablename__ = "lots"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("production_orders.id"))
    code: Mapped[str] = mapped_column(String(64))

class SerialUnit(Base):
    __tablename__ = "serial_units"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    lot_id: Mapped[str] = mapped_column(ForeignKey("lots.id"))
    serial: Mapped[str] = mapped_column(String(128), unique=True)
    status: Mapped[str] = mapped_column(String(32), default="InProcess")

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(64))
    site_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(200), default="demo")

class QualityEvent(Base):
    __tablename__ = "quality_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"))
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"))
    status: Mapped[str] = mapped_column(String(32), default="DETECTED")
    version: Mapped[int] = mapped_column(Integer, default=1)
    severity: Mapped[str] = mapped_column(String(32), default="High")
    characteristic: Mapped[str] = mapped_column(String(200))
    measured_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    units: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    specification: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    origin: Mapped[str] = mapped_column(String(32), default="model")
    product_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    order_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    lot_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    unit_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    asset_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    line_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    owner_role: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    owner_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    containment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    disposition: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rca_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    corrective_action: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    effectiveness: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    affected_scope: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    evidence: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    context: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)
    anomaly_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class Anomaly(Base):
    __tablename__ = "anomalies"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"))
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    signal: Mapped[str] = mapped_column(String(128))
    severity: Mapped[str] = mapped_column(String(32))
    confidence: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(32), default="Open")
    features: Mapped[dict] = mapped_column(JSONB, default=dict)
    baseline_version: Mapped[str] = mapped_column(String(64), default="v1")
    model_version: Mapped[str] = mapped_column(String(64), default="iforest-bearing-v1")
    evidence_ref: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class Prediction(Base):
    __tablename__ = "predictions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    failure_mode_id: Mapped[str] = mapped_column(ForeignKey("failure_modes.id"))
    health_index: Mapped[float] = mapped_column(Float)
    probability_in_horizon: Mapped[float] = mapped_column(Float)
    horizon_hours: Mapped[float] = mapped_column(Float)
    model_version: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="Open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class WorkTask(Base):
    __tablename__ = "work_tasks"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    site_id: Mapped[str] = mapped_column(ForeignKey("sites.id"))
    title: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(32), default="New")
    priority: Mapped[str] = mapped_column(String(32), default="High")
    role: Mapped[str] = mapped_column(String(64))
    source_event_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    asset_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    evidence: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    finding: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class Hypothesis(Base):
    __tablename__ = "hypotheses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    quality_event_id: Mapped[str] = mapped_column(ForeignKey("quality_events.id"))
    rank: Mapped[int] = mapped_column(Integer)
    cause_code: Mapped[str] = mapped_column(String(64))
    cause: Mapped[str] = mapped_column(String(400))
    confidence: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(32), default="proposed")
    rationale: Mapped[str] = mapped_column(Text)
    evidence_ids: Mapped[list] = mapped_column(JSONB, default=list)
    counter_evidence_ids: Mapped[list] = mapped_column(JSONB, default=list)
    assumptions: Mapped[list] = mapped_column(JSONB, default=list)
    confirm_tests: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class RcaAnalysis(Base):
    __tablename__ = "rca_analyses"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    quality_event_id: Mapped[str] = mapped_column(ForeignKey("quality_events.id"))
    summary: Mapped[str] = mapped_column(Text)
    overall_confidence: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class KnowledgeCase(Base):
    __tablename__ = "knowledge_cases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"))
    title: Mapped[str] = mapped_column(String(300))
    problem: Mapped[str] = mapped_column(Text)
    confirmed_cause: Mapped[str] = mapped_column(Text)
    corrective_action: Mapped[str] = mapped_column(Text)
    effectiveness: Mapped[str] = mapped_column(Text)
    applicability: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(32), default="approved")
    version: Mapped[int] = mapped_column(Integer, default=1)
    source_event_ids: Mapped[list] = mapped_column(JSONB, default=list)
    embedding_text: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class KnowledgeProposal(Base):
    __tablename__ = "knowledge_proposals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    quality_event_id: Mapped[str] = mapped_column(ForeignKey("quality_events.id"))
    status: Mapped[str] = mapped_column(String(32), default="Pending Approval")
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class AuditEntry(Base):
    __tablename__ = "audit_entries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    actor: Mapped[str] = mapped_column(String(200))
    actor_type: Mapped[str] = mapped_column(String(32), default="human")
    action: Mapped[str] = mapped_column(String(128))
    target_type: Mapped[str] = mapped_column(String(64))
    target_id: Mapped[str] = mapped_column(String(36))
    site_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    correlation_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    before: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    after: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class EntityNode(Base):
    __tablename__ = "entity_nodes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"))
    kind: Mapped[str] = mapped_column(String(64))
    label: Mapped[str] = mapped_column(String(200))
    props: Mapped[dict] = mapped_column(JSONB, default=dict)

class EntityEdge(Base):
    __tablename__ = "entity_edges"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"))
    src_id: Mapped[str] = mapped_column(ForeignKey("entity_nodes.id"))
    dst_id: Mapped[str] = mapped_column(ForeignKey("entity_nodes.id"))
    rel_type: Mapped[str] = mapped_column(String(64))
    provenance: Mapped[dict] = mapped_column(JSONB, default=dict)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    valid_to: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    tx_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    creator_type: Mapped[str] = mapped_column(String(32), default="seed")
    approval_status: Mapped[str] = mapped_column(String(32), default="approved")

class SignalSample(Base):
    """Hot metadata pointer; raw series also in ClickHouse."""
    __tablename__ = "signal_samples"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("assets.id"))
    signal: Mapped[str] = mapped_column(String(128))
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(32), default="")
    quality: Mapped[str] = mapped_column(String(32), default="good")
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class IntegrationConnector(Base):
    """Configured OT/IT connector (OPC UA, MES/QMS/CMMS REST)."""
    __tablename__ = "integration_connectors"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"))
    site_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="unknown")
    endpoint_url: Mapped[str] = mapped_column(String(500))
    secret_ref: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_success_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    throughput_per_min: Mapped[float] = mapped_column(Float, default=0.0)
    success_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class IntegrationConnectorError(Base):
    __tablename__ = "integration_connector_errors"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    connector_id: Mapped[str] = mapped_column(ForeignKey("integration_connectors.id"))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    message: Mapped[str] = mapped_column(Text)
    detail: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    http_status: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class ComplianceObligation(Base):
    """Requirement keyed by market / customer / plant / product scope."""
    __tablename__ = "compliance_obligations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"))
    site_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    code: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    audience: Mapped[str] = mapped_column(String(32), default="internal")  # internal|customer|regulatory|public
    family: Mapped[str] = mapped_column(String(64))  # qms|ppap|manufacturing|problem_solving|...
    country: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    customer: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    product: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    model_year: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    component: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    standard_refs: Mapped[list] = mapped_column(JSONB, default=list)  # IATF, CSR, FMVSS, etc.
    effective_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cadence: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # quarterly|annual|event
    status: Mapped[str] = mapped_column(String(32), default="active")
    risk: Mapped[str] = mapped_column(String(32), default="Medium")
    owner_role: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    props: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ReportTemplate(Base):
    """Versioned report template — customer/OEM-specific, not one universal IATF form."""
    __tablename__ = "report_templates"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"))
    code: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(300))
    family: Mapped[str] = mapped_column(String(64))
    audience: Mapped[str] = mapped_column(String(32), default="internal")
    customer: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    version: Mapped[str] = mapped_column(String(32), default="1.0")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sections: Mapped[list] = mapped_column(JSONB, default=list)
    required_evidence_kinds: Mapped[list] = mapped_column(JSONB, default=list)
    status: Mapped[str] = mapped_column(String(32), default="active")
    props: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ReportInstance(Base):
    """Concrete report with draft → accepted lifecycle and evidence graph lite."""
    __tablename__ = "report_instances"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"))
    site_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    template_id: Mapped[str] = mapped_column(ForeignKey("report_templates.id"))
    obligation_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    title: Mapped[str] = mapped_column(String(300))
    family: Mapped[str] = mapped_column(String(64))
    audience: Mapped[str] = mapped_column(String(32), default="internal")
    customer: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="DRAFT")
    version: Mapped[int] = mapped_column(Integer, default=1)
    period_label: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    owner_role: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    owner_user_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    ai_draft: Mapped[bool] = mapped_column(Boolean, default=False)
    filing_channel: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # portal|email|stub|none
    external_ref: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    evidence_links: Mapped[list] = mapped_column(JSONB, default=list)
    # [{kind, id, label, occurred_at?}]
    audit_trail: Mapped[list] = mapped_column(JSONB, default=list)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AgentDefinition(Base):
    """Human-authored agent config. Always draft on create; humans promote. Propose-only (no OT write)."""
    __tablename__ = "agent_definitions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"))
    site_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    agent_type: Mapped[str] = mapped_column(String(64), default="custom")  # rca_investigator|knowledge_curator|custom
    prompt_key: Mapped[str] = mapped_column(String(128), default="custom")  # prompts/<key>/vN
    prompt_version: Mapped[str] = mapped_column(String(32), default="v1")
    allowed_tools: Mapped[list] = mapped_column(JSONB, default=list)
    # [{id, kind, label, scope}] — scope forced to read
    entity_refs: Mapped[list] = mapped_column(JSONB, default=list)
    autonomy_level: Mapped[str] = mapped_column(String(64), default="L1")
    budgets: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(32), default="Draft")  # Draft|Active (promotion is separate)
    ot_write: Mapped[bool] = mapped_column(Boolean, default=False)
    mode: Mapped[str] = mapped_column(String(64), default="read + draft")
    source: Mapped[str] = mapped_column(String(32), default="custom")  # system|custom
    created_by: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ComplianceDeadline(Base):
    """Compliance calendar entries (EWR quarters, cert expiry, CQI annual, …)."""
    __tablename__ = "compliance_deadlines"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id"))
    site_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    obligation_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    report_instance_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    title: Mapped[str] = mapped_column(String(300))
    kind: Mapped[str] = mapped_column(String(64))  # ewr|cert|cqi|ppap|audit|regulatory|other
    audience: Mapped[str] = mapped_column(String(32), default="internal")
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), default="upcoming")  # upcoming|due|overdue|done
    owner_role: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    props: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
