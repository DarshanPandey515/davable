from __future__ import annotations

import logging
import os
import shutil
import threading
import time
from pathlib import Path
from typing import Dict

from e2b import Sandbox
from e2b.sandbox.commands.command_handle import CommandExitException
from e2b.sandbox.filesystem.filesystem import FileType

from .policy import ToolError, resolve as policy_resolve

logger = logging.getLogger(__name__)

E2B_APP_DIR = "/home/user/app"
E2B_TIMEOUT = int(os.getenv("E2B_TIMEOUT", "1800"))
E2B_SYNC_MAX_BYTES = 2_000_000
E2B_SYNC_EXCLUDE = {"node_modules", ".git", "dist", "build", ".vite", ".npm-cache", ".agent-trash", ".agent-state.json"}

DEV_SERVER_PORT = 5173
DEFAULT_COMMAND_TIMEOUT = 120


class E2BExecutor:
    sandboxes: Dict[str, "object"] = {}
    sandboxes_lock = threading.Lock()

    def __init__(self, project_id: str, host_workspace: Path, state=None):
        self.project_id = project_id
        self.host_workspace = host_workspace
        self.sandbox = None
        self.state = state

    def require_sandbox(self):
        if self.sandbox is None:
            raise RuntimeError("Sandbox not started - call create_project() first")
        return self.sandbox

    def create_project(self) -> None:
        self.host_workspace.mkdir(parents=True, exist_ok=True)

        with self.sandboxes_lock:
            sandbox = self.sandboxes.get(self.project_id)
            if sandbox is not None:
                try:
                    if not sandbox.is_running():
                        sandbox = None
                except Exception:
                    sandbox = None

            if sandbox is None:
                logger.info(f"Creating E2B sandbox for project {self.project_id}")
        
                sandbox = Sandbox.create("base", timeout=E2B_TIMEOUT)
        
                sandbox.commands.run(f"mkdir -p {E2B_APP_DIR}", cwd="/", timeout=30)
        
                self.sync_to_sandbox(sandbox)
                self.install_if_needed(sandbox)
                self.sandboxes[self.project_id] = sandbox
        
            else:
                logger.info(f"Reattached to E2B sandbox for project {self.project_id}")

            self.sandbox = sandbox

    def destroy(self) -> None:
        with self.sandboxes_lock:
            sandbox = self.sandboxes.pop(self.project_id, None)
        
        self.sandbox = None
        
        if sandbox is not None:
            try:
                sandbox.kill()
        
            except Exception as e:
                logger.warning(f"Could not kill E2B sandbox: {e}")

    def host_path(self, path: str) -> Path:
        resolved = policy_resolve(self.host_workspace, path)
        if isinstance(resolved, ToolError):
            raise ValueError(resolved.message)
        return resolved

    def install_if_needed(self, sandbox) -> None:
        remote_pkg = f"{E2B_APP_DIR}/package.json"
        remote_modules = f"{E2B_APP_DIR}/node_modules"
        
        try:
            if sandbox.files.exists(remote_pkg) and not sandbox.files.exists(remote_modules):
                logger.info(f"npm install in sandbox for project {self.project_id}")
                sandbox.commands.run("npm install", cwd=E2B_APP_DIR, timeout=600)
                
        except Exception as e:
            logger.warning(f"npm install in sandbox failed: {e}")

    def iter_host_files(self):
        root = self.host_workspace.resolve()
        
        for file in root.rglob("*"):
            if not file.is_file():
                continue
            
            rel = file.relative_to(root)
            
            if any(part in E2B_SYNC_EXCLUDE for part in rel.parts):
                continue
            
            yield rel.as_posix(), file

    def sync_to_sandbox(self, sandbox) -> None:
        for rel, file in self.iter_host_files():
            try:
                sandbox.files.write(f"{E2B_APP_DIR}/{rel}", file.read_bytes())
            
            except Exception as e:
                logger.warning(f"Could not upload {rel} to sandbox: {e}")

    def iter_sandbox_files(self, sandbox, remote_dir: str = E2B_APP_DIR, rel: str = ""):
        
        try:
            entries = sandbox.files.list(remote_dir, depth=1)
        
        except Exception as e:
            logger.warning(f"Could not list sandbox dir {remote_dir}: {e}")
            return
        
        for entry in entries:
            name = entry.name
            
            if name in E2B_SYNC_EXCLUDE:
                continue
            
            child_rel = f"{rel}/{name}" if rel else name
            
            if entry.type == FileType.DIR:
                yield from self.iter_sandbox_files(sandbox, entry.path, child_rel)
            
            else:
                size = getattr(entry, "size", 0) or 0
                if size > E2B_SYNC_MAX_BYTES:
                    continue
                
                yield child_rel

    def sync_to_host(self) -> None:
        sandbox = self.sandbox
        if sandbox is None:
            return
        root = self.host_workspace.resolve()
        for rel in self.iter_sandbox_files(sandbox):
            try:
                data = sandbox.files.read(f"{E2B_APP_DIR}/{rel}", format="bytes")
            except Exception as e:
                logger.warning(f"Could not download {rel} from sandbox: {e}")
                continue
            target = root / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(bytes(data))

    def write_file(self, path: str, content: str) -> None:
        target = self.host_path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        self.require_sandbox().files.write(f"{E2B_APP_DIR}/{path}", content)
        # Single choke point: every agent write routes through here, so this
        # is where the state store learns a file changed.
        if self.state is not None:
            self.state.record_write(path, content)

    def read_file(self, path: str) -> str:
        return self.host_path(path).read_text()

    def sync_workspace(self) -> None:
        """Push host workspace files to the sandbox (used after restores)."""
        if self.sandbox is not None:
            self.sync_to_sandbox(self.sandbox)

    def delete_file(self, path: str) -> str:
        """Move a workspace file into .agent-trash and remove it remotely."""
        target = self.host_path(path)
        if not target.exists():
            raise FileNotFoundError(f"{path} not found")
        trash_dir = self.host_workspace / ".agent-trash" / time.strftime("%Y%m%d_%H%M%S")
        trash_dir.mkdir(parents=True, exist_ok=True)
        moved = trash_dir / target.name
        shutil.move(str(target), str(moved))
        if self.sandbox is not None:
            remote = f"{E2B_APP_DIR}/{path}"
            try:
                if self.sandbox.files.exists(remote):
                    self.sandbox.files.remove(remote)
            except Exception as e:
                logger.warning(f"Could not remove {path} in sandbox: {e}")
        if self.state is not None:
            self.state.record_delete(path)
        return moved.relative_to(self.host_workspace).as_posix()

    def run_command(self, command: str, timeout: int = DEFAULT_COMMAND_TIMEOUT) -> dict:
        sandbox = self.require_sandbox()
        try:
            result = sandbox.commands.run(command, cwd=E2B_APP_DIR, timeout=timeout)
            success, exit_code = result.exit_code == 0, result.exit_code
            output = (result.stdout or "") + (result.stderr or "")
        except CommandExitException as e:
            success, exit_code = False, e.exit_code
            output = (e.stdout or "") + (e.stderr or "")
        except Exception as e:
            logger.warning(f"E2B command failed: {command}: {e}")
            timed_out = "timed out" in str(e).lower() or "timeout" in type(e).__name__.lower()
            return {"success": False, "output": str(e), "exit_code": None, "timed_out": timed_out}
        finally:
            self.sync_to_host()

        return {"success": success, "output": output, "exit_code": exit_code, "timed_out": False}

    def start_server(self, port: int = DEV_SERVER_PORT) -> str:
        sandbox = self.require_sandbox()
        self.stop_server()
        sandbox.commands.run(
            f"npm run dev -- --host 0.0.0.0 --port {port}",
            cwd=E2B_APP_DIR,
            background=True,
        )
        time.sleep(1.5)
        return f"https://{sandbox.get_host(port)}"

    def stop_server(self) -> None:
        if self.sandbox is None:
            return
        try:
            self.sandbox.commands.run("pkill -f vite || true", cwd=E2B_APP_DIR, timeout=30)
        except Exception:
            pass
