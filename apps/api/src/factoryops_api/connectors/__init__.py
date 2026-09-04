"""OT/IT connector adapters and admin integration service."""
from .registry import get_adapter, list_kinds

__all__ = [
    "get_adapter",
    "list_kinds",
]
