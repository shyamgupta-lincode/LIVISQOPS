"""Context graph seed contract — stable IDs and ISA-95 coverage."""
from __future__ import annotations

from factoryops_api.context_graph_seed import (
    CONTEXT_GRAPH_BINDINGS,
    CONTEXT_GRAPH_LEVELS,
    _eid,
    _nid,
    build_flow_forest,
    published_backplane,
    published_bindings,
    published_levels,
)


def test_stable_id_length():
    assert len(_nid(1)) == 36
    assert len(_eid("a", "b", "contains")) == 36


def test_edge_ids_deterministic():
    assert _eid("src", "dst", "contains") == _eid("src", "dst", "contains")
    assert _eid("src", "dst", "contains") != _eid("src", "dst", "measures")


def test_levels_cover_isa95_spine():
    entities = {lvl["entity"] for lvl in CONTEXT_GRAPH_LEVELS}
    assert {"enterprise", "site", "area", "line", "cell", "asset"} <= entities


def test_bindings_include_legacy_object_types():
    types = {b["object_type"] for b in CONTEXT_GRAPH_BINDINGS}
    for required in ("status", "inspection", "defect", "order", "genealogy", "timeseries", "failure_mode", "lesson"):
        assert required in types


def test_published_helpers_are_compact():
    bindings = published_bindings()
    levels = published_levels()
    assert len(bindings) == len(CONTEXT_GRAPH_BINDINGS)
    assert "rollup_to" in bindings[0]
    assert levels[0]["isa95"]


def test_backplane_spine_is_plant_to_device():
    bp = published_backplane()
    assert [lvl["id"] for lvl in bp["levels"]] == ["plant", "area", "line", "station", "device"]
    assert any(d["object_type"] == "timeseries" for d in bp["dataplanes"])
    assert any(d["object_type"] == "inspection" for d in bp["dataplanes"])


def test_flow_forest_builds_hierarchy_and_attachments():
    site = "site-1"
    area = "area-1"
    line = "line-1"
    cell = "cell-1"
    asset = "asset-1"
    signal = "sig-1"
    nodes = [
        {"id": site, "kind": "site", "label": "Midwest", "props": {"code": "MH"}},
        {"id": area, "kind": "area", "label": "Discrete", "props": {"site_id": site}},
        {"id": line, "kind": "line", "label": "Line A", "props": {}},
        {"id": cell, "kind": "cell", "label": "Station 1", "props": {"line_id": line}},
        {"id": asset, "kind": "asset", "label": "Spindle", "props": {"health_index": 0.71, "demo_scenario": "bearing_wear"}},
        {"id": signal, "kind": "signal", "label": "vibration", "props": {"key": "vibration_rms"}},
    ]
    edges = [
        {"id": "e1", "src_id": site, "dst_id": area, "rel_type": "contains"},
        {"id": "e2", "src_id": area, "dst_id": line, "rel_type": "contains"},
        {"id": "e3", "src_id": line, "dst_id": cell, "rel_type": "contains"},
        {"id": "e4", "src_id": cell, "dst_id": asset, "rel_type": "contains"},
        {"id": "e5", "src_id": asset, "dst_id": signal, "rel_type": "measures"},
    ]
    forest = build_flow_forest(nodes, edges, site_id=site)
    assert forest["stats"]["roots"] == 1
    assert forest["stats"]["by_level"]["plant"] == 1
    assert forest["stats"]["by_level"]["device"] == 1
    plant = forest["roots"][0]
    device = plant["children"][0]["children"][0]["children"][0]["children"][0]
    assert device["label"] == "Spindle"
    assert device["level"] == "device"
    assert any(a["object_type"] == "timeseries" for a in device["attachments"])
    assert device["binding_slots"]
    assert device["link"]["protocol"] == "OPC UA"
    assert device["link"]["direction"] == "subscribe"
    station = plant["children"][0]["children"][0]["children"][0]
    assert station["link"]["protocol"] == "MQTT Sparkplug B"


def test_flow_forest_uses_edge_provenance_link():
    site = "site-1"
    area = "area-1"
    nodes = [
        {"id": site, "kind": "site", "label": "Midwest", "props": {}},
        {"id": area, "kind": "area", "label": "Discrete", "props": {"site_id": site}},
    ]
    edges = [
        {
            "id": "e1",
            "src_id": site,
            "dst_id": area,
            "rel_type": "contains",
            "provenance": {
                "source": "seed",
                "link": {
                    "protocol": "Kafka/Redpanda",
                    "transport": "kafka",
                    "direction": "publish",
                    "topic": "context.areas",
                    "endpoint": "redpanda:9092",
                    "connector_kind": "kafka",
                },
            },
        }
    ]
    forest = build_flow_forest(nodes, edges, site_id=site)
    area_node = forest["roots"][0]["children"][0]
    assert area_node["link"]["protocol"] == "Kafka/Redpanda"
    assert area_node["link"]["topic"] == "context.areas"


def test_bindings_expose_protocol_transport():
    for b in published_bindings():
        assert b.get("protocol")
        assert "transport" in b
        assert "direction" in b
