from agents.project_manager import project_manager


def read_file(path: str) -> str:
    executor = project_manager.get_active_executor()
    return executor.read_file(path)