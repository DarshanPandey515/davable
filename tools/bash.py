from agents.project_manager import project_manager
from agents.executor import DEFAULT_COMMAND_TIMEOUT


def run_command(command: str, timeout: int = DEFAULT_COMMAND_TIMEOUT) -> dict:
    executor = project_manager.get_active_executor()
    return executor.run_command(command, timeout=timeout)