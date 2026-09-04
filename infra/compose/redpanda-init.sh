#!/bin/bash
set -euo pipefail
TOPICS=(
  telemetry.raw asset.state production.context inspection.results
  anomalies.detected quality.events maintenance.predictions workflow.actions
  agent.requests agent.results knowledge.proposals
  telemetry.raw.dlq anomalies.detected.dlq quality.events.dlq agent.requests.dlq
  telemetry.samples
)
for t in "${TOPICS[@]}"; do
  rpk topic create "$t" -X brokers=redpanda:9092 || true
done
echo "redpanda topics ready"
