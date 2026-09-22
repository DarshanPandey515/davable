"""Runtime-owned project state for the builder agents.

The LLM proposes; this store decides and remembers. Agents read a compact
projection and write structured events back, so "what has happened and what's
true right now" never lives in a context window. Persisted as JSON beside the
workspace so a crashed worker resumes instead of re-deriving state from
transcripts.
"""

from __future__ import annotations

import hashlib
import logging
import re
import time
import uuid
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field, PrivateAttr

logger = logging.getLogger(__name__)

STATE_FILE = ".agent-state.json"
MAX_EVENTS = 200
FIX_ATTEMPT_CAP = 3
DEFAULT_ITERATION_BUDGET = 12


def fingerprint(error_text: str) -> str:
    """Hash the *shape* of a build error, ignoring line numbers and ids.

    Same underlying error => same fingerprint, so a fix loop can tell "no
    progress" from "new error, keep going". Empty output fingerprints to "".
    """
    if not error_text or not error_text.strip():
        return ""
    text = error_text.lower()
    text = re.sub(r"\b\d+:\d+\b", " ", text)  # line:col
    text = re.sub(r"\b\d{3,}\b", " ", text)  # addresses / ids
    text = re.sub(r"\s+", " ", text)
    return hashlib.sha256(text.strip().encode()).hexdigest()[:16]


class TaskStep(BaseModel):
    id: str
    description: str
    owner: str = "codegen"
    status: Literal["pending", "in_progress", "done", "failed", "skipped"] = "pending"
    depends_on: list[str] = Field(default_factory=list)
    result_summary: Optional[str] = None
    attempts: int = 0


class AgentEvent(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])
    agent_role: str
    action: str
    target: Optional[str] = None
    result: Literal["success", "failure", "rejected"] = "success"
    detail: str = ""
    created_at: float = Field(default_factory=time.time)


class BuildStatus(BaseModel):
    passing: bool = False
    fingerprint: str = ""
    summary: str = ""
    tree_version: int = 0
    checked_at: Optional[float] = None


class FileState(BaseModel):
    path: str
    sha256: str = ""
    version: int = 1
    last_written_by: str = "agent"


class ProjectState(BaseModel):
    project_id: str
    goal: str = ""
    plan: list[TaskStep] = Field(default_factory=list)
    files: dict[str, FileState] = Field(default_factory=dict)
    build: BuildStatus = Field(default_factory=BuildStatus)
    attempts: dict[str, int] = Field(default_factory=dict)  # fingerprint -> fix attempts
    events: list[AgentEvent] = Field(default_factory=list)
    tree_version: int = 0
    iteration: int = 0
    iteration_budget: int = DEFAULT_ITERATION_BUDGET

    _workspace: Optional[Path] = PrivateAttr(default=None)

    # --- persistence -----------------------------------------------------

    @classmethod
    def load(cls, workspace, project_id: str) -> "ProjectState":
        workspace = Path(workspace)
        state = None
        path = workspace / STATE_FILE
        if path.exists():
            try:
                state = cls.model_validate_json(path.read_text())
            except Exception as e:
                logger.warning(f"Unreadable agent state at {path}: {e}")
        if state is None:
            state = cls(project_id=project_id)
        state._workspace = workspace
        return state

    def save(self) -> None:
        if self._workspace is None:
            return
        try:
            (self._workspace / STATE_FILE).write_text(self.model_dump_json(indent=2))
        except OSError as e:
            logger.warning(f"Could not persist state for {self.project_id}: {e}")

    # --- mutations -------------------------------------------------------

    def record_event(
        self,
        agent_role: str,
        action: str,
        target: Optional[str] = None,
        result: Literal["success", "failure", "rejected"] = "success",
        detail: str = "",
    ) -> None:
        self.events.append(
            AgentEvent(agent_role=agent_role, action=action, target=target, result=result, detail=detail)
        )
        if len(self.events) > MAX_EVENTS:
            self.events = self.events[-MAX_EVENTS:]
        self.save()

    def record_write(self, path: str, content: str, role: str = "agent") -> None:
        rel = Path(path).as_posix()
        prev = self.files.get(rel)
        self.files[rel] = FileState(
            path=rel,
            sha256=hashlib.sha256(content.encode()).hexdigest(),
            version=(prev.version + 1 if prev else 1),
            last_written_by=role,
        )
        self.tree_version += 1

    def record_delete(self, path: str) -> None:
        self.files.pop(Path(path).as_posix(), None)
        self.tree_version += 1

    def set_plan(self, todos: list) -> None:
        self.plan = [TaskStep(id=f"step-{i + 1}", description=d) for i, d in enumerate(todos)]

    def complete_plan(self) -> None:
        for step in self.plan:
            step.status = "done"
        self.save()

    def record_build(self, output: str, passing: bool) -> str:
        self.build = BuildStatus(
            passing=bool(passing),
            fingerprint=fingerprint(output),
            summary=self._one_line(output),
            tree_version=self.tree_version,
            checked_at=time.time(),
        )
        if passing:
            self.iteration = 0
        self.save()
        return self.build.fingerprint

    def record_restore(self, detail: str = "Reverted to last good snapshot after a failed build") -> None:
        self.build = BuildStatus(
            passing=True,
            summary="reverted to last good snapshot",
            tree_version=self.tree_version,
            checked_at=time.time(),
        )
        self.record_event("orchestrator", "restore", result="success", detail=detail)

    def note_fix_attempt(self, fp: str) -> None:
        if fp:
            self.attempts[fp] = self.attempts.get(fp, 0) + 1
        self.iteration += 1
        self.save()

    def should_escalate(self, fp: str, cap: int = FIX_ATTEMPT_CAP) -> bool:
        if not fp:
            return False
        return self.attempts.get(fp, 0) >= cap or self.iteration >= self.iteration_budget

    # --- context projection ---------------------------------------------

    def projection(self, role: str = "worker") -> str:
        """The narrow slice an agent needs - never the whole store."""
        lines = []
        if self.build.passing:
            lines.append("Last build: passing.")
        elif self.build.summary:
            lines.append(f"Last build: FAILING - {self.build.summary}")
            attempts = self.attempts.get(self.build.fingerprint, 0)
            if attempts:
                lines.append(f"Previous fix attempts on this exact error: {attempts}.")
        if role == "fixer":
            pending = [s.description for s in self.plan if s.status != "done"]
            if pending:
                lines.append("Plan steps still open: " + "; ".join(pending[:5]))
        if self.events:
            recent = "; ".join(f"{e.agent_role}:{e.action}" for e in self.events[-3:])
            lines.append(f"Recent actions: {recent}.")
        return "\n".join(lines)

    def is_build_fresh(self) -> bool:
        return self.build.passing and self.build.tree_version == self.tree_version

    @staticmethod
    def _one_line(text: str, limit: int = 200) -> str:
        for line in (text or "").splitlines():
            line = line.strip()
            if line:
                return line[:limit]
        return ""
