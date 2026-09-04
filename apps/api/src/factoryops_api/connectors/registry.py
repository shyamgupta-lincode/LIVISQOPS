from __future__ import annotations

from factoryops_domain.connectors import ConnectorKind, DataConnector

from .adapters import CmmsRestAdapter, MesRestAdapter, OpcUaAdapter, QmsRestAdapter

_ADAPTERS: dict[ConnectorKind, DataConnector] = {
    ConnectorKind.OPC_UA: OpcUaAdapter(),
    ConnectorKind.MES_REST: MesRestAdapter(),
    ConnectorKind.QMS_REST: QmsRestAdapter(),
    ConnectorKind.CMMS_REST: CmmsRestAdapter(),
}


def get_adapter(kind: str | ConnectorKind) -> DataConnector:
    k = ConnectorKind(kind) if isinstance(kind, str) else kind
    try:
        return _ADAPTERS[k]
    except KeyError as exc:
        raise ValueError(f"unsupported connector kind: {kind}") from exc


def list_kinds() -> list[str]:
    return [k.value for k in _ADAPTERS]
