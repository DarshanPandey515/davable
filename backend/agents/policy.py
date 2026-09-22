"""Policy engine for the agent computer interface.

Path containment and capability caps live here, enforced by the tools and by
the executor — the model's prompts are behavioral controls; these are not.
"""

from __future__ import annotations

import fnmatch
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel

ErrorCode = Literal[
    "PATH_OUTSIDE_WORKSPACE",
    "DENIED_PATH",
    "NOT_FOUND",
    "STALE_VERSION",
    "NO_MATCH",
    "AMBIGUOUS_MATCH",
    "EXISTS",
    "TOO_LARGE",
    "TIMEOUT",
]


class ToolError(BaseModel):
    code: ErrorCode
    message: str
    path: Optional[str] = None
    recoverable: bool = True


DENY_GLOBS = (
    ".env*",
    "*.env",
    "*credentials*",
    "*secret*",
    "*.pem",
    "id_rsa*",
    "*.key",
)


def _denied(rel: str) -> bool:
    parts = rel.split("/")
    for pattern in DENY_GLOBS:
        if fnmatch.fnmatch(rel, pattern) or any(fnmatch.fnmatch(part, pattern) for part in parts):
            return True
    return False


def resolve(workspace: Path, path: str) -> Path | ToolError:
    """Canonicalize `path` under `workspace`, or return a structured error."""
    root = workspace.resolve()
    raw = Path(path)
    if raw.is_absolute():
        return ToolError(
            code="PATH_OUTSIDE_WORKSPACE",
            message=f"Path '{path}' is absolute; use a workspace-relative path.",
            path=path,
        )
    resolved = (root / raw).resolve()
    if resolved != root and root not in resolved.parents:
        return ToolError(
            code="PATH_OUTSIDE_WORKSPACE",
            message=f"Path '{path}' escapes the workspace.",
            path=path,
        )
    rel = resolved.relative_to(root).as_posix()
    if _denied(rel):
        return ToolError(
            code="DENIED_PATH",
            message=f"Path '{path}' is not accessible to the agent.",
            path=path,
        )
    return resolved


class Policy:
    def __init__(self, **caps):
        self.max_read_lines = caps.get("max_read_lines", 200)
        self.max_read_bytes = caps.get("max_read_bytes", 64_000)
        self.max_patch_bytes = caps.get("max_patch_bytes", 64_000)
        self.max_output_bytes = caps.get("max_output_bytes", 16_000)
        self.max_search_results = caps.get("max_search_results", 50)
        self.exec_timeout_s = caps.get("exec_timeout_s", 120)

    def clip(self, text: str, limit: Optional[int] = None) -> tuple:
        """Return (text, truncated)."""
        cap = limit if limit is not None else self.max_output_bytes
        if not text or len(text) <= cap:
            return text or "", False
        return text[:cap] + f"\n... [truncated {len(text) - cap} chars]", True


DEFAULT_POLICY = Policy()
