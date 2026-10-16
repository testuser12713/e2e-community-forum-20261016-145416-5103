"""Tests of the shared package. The repo root is put on sys.path so that the
package is importable when pytest runs from inside ``shared/`` without an
editable install (the CI installs it too, but local runs must work anyway)."""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
