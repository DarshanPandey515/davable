from __future__ import annotations

import concurrent.futures
import logging
import os
import socket
import threading
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

import docker
from docker.errors import APIError, NotFound
from docker.models.containers import Container

logger = logging.getLogger(__name__)

SANDBOX_IMAGE = "davable-sandbox:latest"
CONTAINER_APP_DIR = "/app"
CONTAINER_LABEL_KEY = "davable.project_id"

DEV_SERVER_PORT = 5173
PORT_RANGE = (30000, 31000)
DEFAULT_COMMAND_TIMEOUT = 120


def _host_uid_gid() -> Optional[str]:
    try:
        return f"{os.getuid()}:{os.getgid()}"
    except AttributeError:
        return None
    


class Executor(ABC):
    @abstractmethod
    def create_project(self) -> None: ...

    @abstractmethod
    def write_file(self, path: str, content: str) -> None: ...

    @abstractmethod
    def read_file(self, path: str) -> str: ...

    @abstractmethod
    def run_command(self, command: str, timeout: int = DEFAULT_COMMAND_TIMEOUT) -> dict: ...

    @abstractmethod
    def start_server(self, port: int = DEV_SERVER_PORT) -> str: ...

    @abstractmethod
    def stop_server(self) -> None: ...

    @abstractmethod
    def destroy(self) -> None: ...


def _find_free_port(start: int = PORT_RANGE[0], end: int = PORT_RANGE[1]) -> int:
    for port in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("0.0.0.0", port))
                return port
            except OSError:
                continue
    raise RuntimeError("No free host port available for the dev server")


_docker_client_lock = threading.Lock()
_docker_client: Optional["docker.DockerClient"] = None


def _client() -> "docker.DockerClient":
    global _docker_client
    with _docker_client_lock:
        if _docker_client is None:
            _docker_client = docker.from_env()
        return _docker_client


class DockerExecutor(Executor):

    def __init__(self, project_id: str, host_workspace: Path):
        self.project_id = project_id
        self.host_workspace = host_workspace
        self.container_name = f"davable-sandbox-{project_id}"
        self._container: Optional[Container] = None
        self.host_port: Optional[int] = None


    def create_project(self) -> None:
        self.host_workspace.mkdir(parents=True, exist_ok=True)
        client = _client()

        existing = self._find_existing_container(client)
        if existing is not None:
            self._container = existing
            self._sync_port_from_container()
            if existing.status != "running":
                existing.start()
            logger.info(f"Reattached to existing container {self.container_name}")
            return

        self.host_port = _find_free_port()
        logger.info(
            f"Creating container {self.container_name} "
            f"(host port {self.host_port} -> {DEV_SERVER_PORT})"
        )

        run_kwargs = dict(
            name=self.container_name,
            command="tail -f /dev/null",
            working_dir=CONTAINER_APP_DIR,
            volumes={
                str(self.host_workspace.resolve()): {"bind": CONTAINER_APP_DIR, "mode": "rw"}
            },
            ports={f"{DEV_SERVER_PORT}/tcp": self.host_port},
            labels={CONTAINER_LABEL_KEY: self.project_id},
            environment={"HOME": "/tmp", "npm_config_cache": "/tmp/.npm-cache"},
            detach=True,
            tty=True,
            mem_limit="1g",
            nano_cpus=int(1.5 * 1e9),
        )

        user = _host_uid_gid()
        if user:
            run_kwargs["user"] = user

        self._container = client.containers.run(SANDBOX_IMAGE, **run_kwargs)

    def destroy(self) -> None:
        if self._container is None:
            self._container = self._find_existing_container(_client())
        if self._container is not None:
            try:
                self._container.remove(force=True)
            except NotFound:
                pass
            self._container = None

    def _find_existing_container(self, client) -> Optional[Container]:
        try:
            containers = client.containers.list(
                all=True, filters={"label": f"{CONTAINER_LABEL_KEY}={self.project_id}"}
            )
            return containers[0] if containers else None
        except APIError as e:
            logger.warning(f"Could not query existing containers: {e}")
            return None

    def _sync_port_from_container(self) -> None:
        self._container.reload()
        bindings = self._container.attrs.get("NetworkSettings", {}).get("Ports", {}) or {}
        mapping = bindings.get(f"{DEV_SERVER_PORT}/tcp")
        if mapping:
            self.host_port = int(mapping[0]["HostPort"])

    def _host_path(self, path: str) -> Path:
        root = self.host_workspace.resolve()
        resolved = (self.host_workspace / path).resolve()
        if resolved != root and root not in resolved.parents:
            raise ValueError(f"Path '{path}' escapes the project workspace")
        return resolved

    def write_file(self, path: str, content: str) -> None:
        target = self._host_path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)

    def read_file(self, path: str) -> str:
        target = self._host_path(path)
        if not target.exists():
            raise FileNotFoundError(f"{path} not found")
        return target.read_text()

    def run_command(self, command: str, timeout: int = DEFAULT_COMMAND_TIMEOUT) -> dict:
        if self._container is None:
            raise RuntimeError("Container not started - call create_project() first")

        def _exec():
            return self._container.exec_run(
                ["sh", "-c", command], workdir=CONTAINER_APP_DIR, demux=True
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(_exec)
            try:
                exit_code, (stdout, stderr) = future.result(timeout=timeout)
            except concurrent.futures.TimeoutError:
                logger.warning(f"Command timed out after {timeout}s: {command}")
                return {
                    "success": False,
                    "output": f"Command timed out after {timeout}s: {command}",
                    "exit_code": None,
                }

        output = (stdout or b"").decode(errors="replace") + (stderr or b"").decode(errors="replace")
        return {"success": exit_code == 0, "output": output, "exit_code": exit_code}


    def start_server(self, port: int = DEV_SERVER_PORT) -> str:
        if self._container is None:
            raise RuntimeError("Container not started - call create_project() first")

        self.stop_server()

        client = _client()
        start_cmd = (
            f"nohup npm run dev -- --host 0.0.0.0 --port {port} "
            f"> /tmp/devserver.log 2>&1 < /dev/null & echo $!"
        )
        exec_id = client.api.exec_create(
            self._container.id, ["sh", "-c", start_cmd], workdir=CONTAINER_APP_DIR
        )
        client.api.exec_start(exec_id)  

        time.sleep(1.5)  
        return f"http://localhost:{self.host_port}"

    def stop_server(self) -> None:
        if self._container is None:
            return
        self._container.exec_run("pkill -f vite || true", workdir=CONTAINER_APP_DIR)