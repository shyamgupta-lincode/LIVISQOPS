# Agent safety (implemented)

- No LLM in `stream-worker` telemetry loop.
- Providers: `MockAgentProvider` (default) and `OpenAIResponsesProvider` (env-gated).
- Prompts versioned under `prompts/rca-investigator` and `prompts/knowledge-curator`.
- Contract tests assert schema shape, citation presence, and OT tool deny (`tests/contract/test_agent_eval.py`, `tests/security/test_ot_deny.py`).
- Agents write proposals (`RcaAnalysis`, `KnowledgeProposal`); humans confirm hypotheses and steward-approve knowledge.
- Custom agent configs (`agent_definitions`) are created as **Draft** via `POST /api/v1/admin/agents` with read-scoped entity refs only; denied tools (`write_plc`, `set_recipe`, …) are rejected at create; audit action `agent.create`.
