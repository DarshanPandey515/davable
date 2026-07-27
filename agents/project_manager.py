import os
import uuid
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

from agents.executor import DockerExecutor, Executor

BASE_WORKSPACE = Path(
    os.getenv("WORKSPACE_DIR") or (Path(__file__).parent / "workspace")
)


@dataclass
class Project:
    id: str
    workspace: Path
    executor: Executor
    preview_url: Optional[str] = None


class ProjectManager:

    def __init__(self):
        BASE_WORKSPACE.mkdir(parents=True, exist_ok=True)
        self._projects: Dict[str, Project] = {}
        self.active_project_id: Optional[str] = None

    @property
    def active_project_path(self) -> Optional[Path]:
        project = self._active_project()
        return project.workspace if project else None

    def get_active_executor(self) -> Executor:
        project = self._active_project()
        if project is None:
            raise ValueError("No active project. Create one first.")
        return project.executor

    def _active_project(self) -> Optional[Project]:
        if self.active_project_id is None:
            return None
        return self._projects.get(self.active_project_id)


    def create_project(self) -> str:
        project_id = str(uuid.uuid4())[:8]
        workspace = BASE_WORKSPACE / f"project_{project_id}"
        workspace.mkdir(parents=True, exist_ok=True)

        executor = DockerExecutor(project_id, workspace)
        executor.create_project()

        self._projects[project_id] = Project(id=project_id, workspace=workspace, executor=executor)
        self.active_project_id = project_id

        print(f"Created project: project_{project_id} at {workspace} "
              f"(container davable-sandbox-{project_id})")
        return project_id

    def get_project_path(self, project_id: Optional[str] = None) -> Path:
        project_id = project_id or self.active_project_id
        if project_id is None:
            raise ValueError("No active project. Create one first.")

        workspace = BASE_WORKSPACE / f"project_{project_id}"
        if not workspace.exists():
            raise FileNotFoundError(f"Project {project_id} not found")
        return workspace

    def set_active_project(self, project_id: str):
        workspace = self.get_project_path(project_id)

        if project_id not in self._projects:
            executor = DockerExecutor(project_id, workspace)
            executor.create_project()
            self._projects[project_id] = Project(id=project_id, workspace=workspace, executor=executor)

        self.active_project_id = project_id
        print(f"Switched to project: project_{project_id}")

    def delete_project(self, project_id: Optional[str] = None):
        project_id = project_id or self.active_project_id
        workspace = self.get_project_path(project_id)

        project = self._projects.get(project_id)
        if project is not None:
            project.executor.destroy()
        else:
            DockerExecutor(project_id, workspace).destroy()

        shutil.rmtree(workspace, ignore_errors=True)

        self._projects.pop(project_id, None)
        if project_id == self.active_project_id:
            self.active_project_id = None

        print(f"Deleted project: project_{project_id}")

    def list_projects(self) -> list:
        projects = []
        for item in BASE_WORKSPACE.iterdir():
            if item.is_dir() and item.name.startswith("project_"):
                project_id = item.name.replace("project_", "")
                file_count = sum(1 for _ in item.rglob("*") if _.is_file())
                projects.append({
                    "id": project_id,
                    "path": str(item),
                    "files": file_count,
                    "exists": True,
                    "container_active": project_id in self._projects,
                })
        return projects

    def get_active_project_info(self) -> dict:
        project = self._active_project()
        if project is None:
            return {"active": False}

        return {
            "active": True,
            "id": project.id,
            "path": str(project.workspace),
            "files": sum(1 for _ in project.workspace.rglob("*") if _.is_file()),
            "preview_url": project.preview_url,
        }

    def start_server(self) -> str:
        project = self._active_project()
        if project is None:
            raise ValueError("No active project. Create one first.")
        project.preview_url = project.executor.start_server()
        return project.preview_url

    def stop_server(self, project_id: Optional[str] = None):
        project = self._projects.get(project_id or self.active_project_id)
        if project:
            project.executor.stop_server()
            project.preview_url = None


project_manager = ProjectManager()