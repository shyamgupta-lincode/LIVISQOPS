import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "packages" / "domain" / "src"))
sys.path.insert(0, str(ROOT / "packages" / "config" / "src"))
sys.path.insert(0, str(ROOT / "apps" / "api" / "src"))
