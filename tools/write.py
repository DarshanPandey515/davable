from agents.project_manager import project_manager


def write_file(path: str, content: str) -> None:
    executor = project_manager.get_active_executor()
    executor.write_file(path, content)