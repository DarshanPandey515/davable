import logging
import os
import shutil
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional

from agents.executor import E2BExecutor
from agents.store import STATE_FILE, ProjectState

logger = logging.getLogger(__name__)

BASE_WORKSPACE = Path(
    os.getenv("WORKSPACE_DIR") or (Path(__file__).parent / "workspace")
)


@dataclass
class Project:
    id: str
    workspace: Path
    executor: E2BExecutor
    preview_url: Optional[str] = None
    state: Optional[ProjectState] = None


class ProjectManager:
    """Owns project workspaces and their sandboxes.

    Runs are handed a `Project` directly, so concurrent conversations never
    share mutable "active project" state.
    """

    def __init__(self):
        BASE_WORKSPACE.mkdir(parents=True, exist_ok=True)
        self._projects: Dict[str, Project] = {}
        self._lock = threading.Lock()

    def create_project(self) -> Project:
        project_id = str(uuid.uuid4())[:8]
        workspace = BASE_WORKSPACE / f"project_{project_id}"
        workspace.mkdir(parents=True, exist_ok=True)

        state = ProjectState.load(workspace, project_id)
        project = Project(
            id=project_id,
            workspace=workspace,
            executor=E2BExecutor(project_id, workspace, state=state),
            state=state,
        )
        project.executor.create_project()

        with self._lock:
            self._projects[project_id] = project
        logger.info(f"Created project {project_id} at {workspace}")
        return project

    def get_project(self, project_id: str) -> Project:
        """Return a project with a live sandbox, reattaching when needed."""
        with self._lock:
            project = self._projects.get(project_id)

        if project is None:
            workspace = self.get_project_path(project_id)
            state = ProjectState.load(workspace, project_id)
            project = Project(
                id=project_id,
                workspace=workspace,
                executor=E2BExecutor(project_id, workspace, state=state),
                state=state,
            )
            with self._lock:
                self._projects[project_id] = project

        project.executor.create_project()
        return project

    def get_project_path(self, project_id: str) -> Path:
        workspace = BASE_WORKSPACE / f"project_{project_id}"
        if not workspace.exists():
            raise FileNotFoundError(f"Project {project_id} not found")
        return workspace

    def delete_project(self, project_id: str) -> None:
        with self._lock:
            project = self._projects.pop(project_id, None)

        workspace = BASE_WORKSPACE / f"project_{project_id}"
        if project is not None:
            project.executor.destroy()
        else:
            E2BExecutor(project_id, workspace).destroy()

        shutil.rmtree(workspace, ignore_errors=True)
        shutil.rmtree(BASE_WORKSPACE / ".snapshots" / project_id, ignore_errors=True)
        logger.info(f"Deleted project {project_id}")

    SNAPSHOT_KEEP = 5
    SNAPSHOT_EXCLUDE = {"node_modules", ".git", "dist", "build", ".vite", ".npm-cache", ".agent-trash", STATE_FILE}

    def snapshot_project(self, project: Project) -> Path:
        """Copy the source tree aside so a broken change can be reverted."""
        snapshot_dir = BASE_WORKSPACE / ".snapshots" / project.id / datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        snapshot_dir.parent.mkdir(parents=True, exist_ok=True)
        self._copy_source_tree(project.workspace, snapshot_dir)
        self._prune_snapshots(project)
        return snapshot_dir

    def restore_project(self, project: Project, snapshot: Path) -> None:
        """Replace the source tree with a snapshot, keeping node_modules."""
        for item in project.workspace.iterdir():
            if item.name in self.SNAPSHOT_EXCLUDE:
                continue
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
            else:
                item.unlink(missing_ok=True)
        self._copy_source_tree(snapshot, project.workspace)
        project.executor.sync_workspace()
        if project.state is not None:
            project.state.record_restore()

    @staticmethod
    def _copy_source_tree(src: Path, dst: Path) -> None:
        dst.mkdir(parents=True, exist_ok=True)
        for item in src.iterdir():
            if item.name in ProjectManager.SNAPSHOT_EXCLUDE:
                continue
            target = dst / item.name
            if item.is_dir():
                shutil.copytree(item, target)
            elif item.is_file():
                shutil.copy2(item, target)

    def _prune_snapshots(self, project: Project) -> None:
        base = BASE_WORKSPACE / ".snapshots" / project.id
        if not base.exists():
            return
        for old in sorted(base.iterdir(), reverse=True)[self.SNAPSHOT_KEEP :]:
            shutil.rmtree(old, ignore_errors=True)


project_manager = ProjectManager()
