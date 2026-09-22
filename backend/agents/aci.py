"""Agent Computer Interface: the narrow tool surface exposed to the fixer.

Reads and search run on the host workspace (synced after every command);
writes go through the executor so host and sandbox stay in lockstep.
"""

from __future__ import annotations

import fnmatch
import hashlib
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from .policy import Policy, ToolError, _denied, resolve

EXCLUDED_DIRS = {"node_modules", ".git", "dist", "build", ".vite", ".npm-cache", ".agent-trash", ".agent-state.json"}
BINARY_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".woff", ".woff2", ".ttf", ".map", ".pdf"}
MAX_LIST_ENTRIES = 200


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _excluded(parts) -> bool:
    return any(part in EXCLUDED_DIRS for part in parts)


# --- contracts -----------------------------------------------------------

class Entry(BaseModel):
    name: str = ""
    type: str = "file"  # "file" | "dir"
    size: int = 0


class ListDirResult(BaseModel):
    path: str = ""
    entries: list = []
    truncated: bool = False
    error: Optional[ToolError] = None


class Match(BaseModel):
    path: str = ""
    line: int = 0
    text: str = ""


class SearchResult(BaseModel):
    query: str = ""
    matches: list = []
    truncated: bool = False
    error: Optional[ToolError] = None


class ReadFileResult(BaseModel):
    path: str = ""
    start_line: int = 0
    end_line: int = 0
    total_lines: int = 0
    content: str = ""
    sha256: str = ""
    truncated: bool = False
    error: Optional[ToolError] = None


class PatchResult(BaseModel):
    path: str = ""
    sha256: str = ""
    lines_added: int = 0
    lines_removed: int = 0
    error: Optional[ToolError] = None


class CreateResult(BaseModel):
    path: str = ""
    sha256: str = ""
    error: Optional[ToolError] = None


class DeleteResult(BaseModel):
    path: str = ""
    moved_to: str = ""
    error: Optional[ToolError] = None


class ExecResult(BaseModel):
    command: str = ""
    exit_code: Optional[int] = None
    output: str = ""
    truncated: bool = False
    timed_out: bool = False
    error: Optional[ToolError] = None


# --- tools ---------------------------------------------------------------

def list_dir(executor, policy: Policy, path: str = ".", depth: int = 1) -> ListDirResult:
    resolved = resolve(executor.host_workspace, path)
    if isinstance(resolved, ToolError):
        return ListDirResult(path=path, error=resolved)
    if not resolved.is_dir():
        return ListDirResult(path=path, error=ToolError(code="NOT_FOUND", message=f"{path} is not a directory", path=path))

    entries = []
    truncated = False
    depth = max(1, min(depth, 5))

    def walk(directory: Path, rel: str, level: int) -> None:
        nonlocal truncated
        if truncated or level > depth:
            return
        try:
            items = sorted(directory.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
        except OSError:
            return
        for item in items:
            if item.name in EXCLUDED_DIRS:
                continue
            child_rel = f"{rel}/{item.name}" if rel else item.name
            if _denied(child_rel):
                continue
            if item.is_dir():
                entries.append(Entry(name=item.name, type="dir"))
                walk(item, child_rel, level + 1)
            elif item.is_file():
                entries.append(Entry(name=item.name, type="file", size=item.stat().st_size))
            if len(entries) >= MAX_LIST_ENTRIES:
                truncated = True
                return

    walk(resolved, "", 1)
    return ListDirResult(path=path, entries=entries[:MAX_LIST_ENTRIES], truncated=truncated)


def search(executor, policy: Policy, query: str, glob: Optional[str] = None, max_results: Optional[int] = None) -> SearchResult:
    if not query or not query.strip():
        return SearchResult(query=query, error=ToolError(code="NO_MATCH", message="query must not be empty"))

    root = executor.host_workspace.resolve()
    needle = query.strip().lower()
    limit = max_results or policy.max_search_results
    matches = []

    for file in root.rglob("*"):
        if not file.is_file():
            continue
        rel = file.relative_to(root).as_posix()
        parts = rel.split("/")
        if _excluded(parts) or _denied(rel):
            continue
        if glob and not fnmatch.fnmatch(rel, glob):
            continue
        if file.suffix.lower() in BINARY_SUFFIXES:
            continue
        try:
            if file.stat().st_size > policy.max_read_bytes:
                continue
            lines = file.read_text(errors="replace").splitlines()
        except OSError:
            continue
        for index, line in enumerate(lines, 1):
            if needle in line.lower():
                matches.append(Match(path=rel, line=index, text=line.strip()[:200]))
                if len(matches) >= limit:
                    return SearchResult(query=query, matches=matches[:limit], truncated=True)
    return SearchResult(query=query, matches=matches, truncated=False)


def read_file(executor, policy: Policy, path: str, start_line: int = 1, end_line: Optional[int] = None) -> ReadFileResult:
    resolved = resolve(executor.host_workspace, path)
    if isinstance(resolved, ToolError):
        return ReadFileResult(path=path, error=resolved)
    if not resolved.is_file():
        return ReadFileResult(path=path, error=ToolError(code="NOT_FOUND", message=f"{path} not found", path=path))

    data = resolved.read_bytes()
    if len(data) > policy.max_read_bytes:
        return ReadFileResult(
            path=path,
            error=ToolError(code="TOO_LARGE", message=f"{path} is {len(data)} bytes; read a line range instead.", path=path),
        )

    text = data.decode(errors="replace")
    lines = text.splitlines()
    total = len(lines)
    start = max(1, start_line)
    if end_line is not None:
        end = min(max(start, end_line), total, start + policy.max_read_lines - 1)
    else:
        end = min(total, start + policy.max_read_lines - 1)
    if start > total:
        return ReadFileResult(path=path, start_line=start, end_line=start, total_lines=total, sha256=_sha256(data))
    return ReadFileResult(
        path=path,
        start_line=start,
        end_line=end,
        total_lines=total,
        content="\n".join(lines[start - 1 : end]),
        sha256=_sha256(data),
        truncated=end < total,
    )


def apply_patch(executor, policy: Policy, path: str, base_sha256: str, old_text: str, new_text: str) -> PatchResult:
    resolved = resolve(executor.host_workspace, path)
    if isinstance(resolved, ToolError):
        return PatchResult(path=path, error=resolved)
    if not resolved.is_file():
        return PatchResult(path=path, error=ToolError(code="NOT_FOUND", message=f"{path} not found", path=path))

    data = resolved.read_bytes()
    current_sha = _sha256(data)
    if current_sha != base_sha256:
        return PatchResult(
            path=path,
            error=ToolError(code="STALE_VERSION", message=f"{path} changed since you read it; re-read it before patching.", path=path),
        )
    if len(new_text) > policy.max_patch_bytes:
        return PatchResult(path=path, error=ToolError(code="TOO_LARGE", message="new_text is too large.", path=path))

    text = data.decode(errors="replace")
    count = text.count(old_text)
    if count == 0:
        return PatchResult(path=path, error=ToolError(code="NO_MATCH", message="old_text not found in file.", path=path))
    if count > 1:
        return PatchResult(
            path=path,
            error=ToolError(code="AMBIGUOUS_MATCH", message="old_text is not unique; include more surrounding context.", path=path),
        )

    new_content = text.replace(old_text, new_text, 1)
    executor.write_file(path, new_content)
    diff = new_text.count("\n") - old_text.count("\n")
    return PatchResult(
        path=path,
        sha256=_sha256(new_content.encode()),
        lines_added=max(diff, 0),
        lines_removed=max(-diff, 0),
    )


def create_file(executor, policy: Policy, path: str, content: str) -> CreateResult:
    resolved = resolve(executor.host_workspace, path)
    if isinstance(resolved, ToolError):
        return CreateResult(path=path, error=resolved)
    if resolved.exists():
        return CreateResult(path=path, error=ToolError(code="EXISTS", message=f"{path} already exists; use apply_patch instead.", path=path))
    if len(content) > policy.max_patch_bytes:
        return CreateResult(path=path, error=ToolError(code="TOO_LARGE", message="content is too large.", path=path))
    executor.write_file(path, content)
    return CreateResult(path=path, sha256=_sha256(content.encode()))


def delete(executor, policy: Policy, path: str) -> DeleteResult:
    resolved = resolve(executor.host_workspace, path)
    if isinstance(resolved, ToolError):
        return DeleteResult(path=path, error=resolved)
    if not resolved.exists():
        return DeleteResult(path=path, error=ToolError(code="NOT_FOUND", message=f"{path} not found", path=path))
    try:
        moved_to = executor.delete_file(path)
    except Exception as e:
        return DeleteResult(path=path, error=ToolError(code="DENIED_PATH", message=str(e), path=path))
    return DeleteResult(path=path, moved_to=moved_to)


def exec(executor, policy: Policy, command: str, timeout_s: Optional[int] = None) -> ExecResult:
    timeout = min(timeout_s or policy.exec_timeout_s, policy.exec_timeout_s)
    result = executor.run_command(command, timeout=timeout)
    output, truncated = policy.clip(result.get("output") or "")
    timed_out = bool(result.get("timed_out"))
    error = None
    if timed_out:
        error = ToolError(code="TIMEOUT", message=f"Command timed out after {timeout}s.", recoverable=True)
    return ExecResult(
        command=command,
        exit_code=result.get("exit_code"),
        output=output,
        truncated=truncated,
        timed_out=timed_out,
        error=error,
    )
