def test_agent_tool_allowlist_excludes_plc():
    allowed = {"search_events", "read_genealogy", "draft_artifact", "run_stats"}
    denied = {"write_plc", "set_recipe", "release_unit", "close_event"}
    assert allowed.isdisjoint(denied)
