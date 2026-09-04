"""Custom agent create: Draft only, OT tools denied, entity refs read-scoped."""

from factoryops_api.agents_admin import ALLOWED_TOOL_CATALOG, DENIED_TOOLS, _sanitize_tools


def test_allowed_tools_disjoint_from_denied():
    assert set(ALLOWED_TOOL_CATALOG).isdisjoint(DENIED_TOOLS)


def test_sanitize_rejects_plc_write():
    try:
        _sanitize_tools(["read_event_context", "write_plc"])
        assert False, "expected HTTPException"
    except Exception as e:
        assert getattr(e, "status_code", None) == 400 or "denied" in str(e).lower()


def test_sanitize_defaults_read_tools():
    tools = _sanitize_tools([])
    assert "read_event_context" in tools
    assert set(tools).isdisjoint(DENIED_TOOLS)
