from agents.project_manager import project_manager


def edit_file(path: str, old_text: str, new_text: str) -> dict:

    executor = project_manager.get_active_executor()

    try:
        content = executor.read_file(path)
    except FileNotFoundError as e:
        return {"success": False, "error": str(e)}

    if old_text not in content:
        return {"success": False, "error": "old_text not found in file"}
    if content.count(old_text) > 1:
        return {"success": False, "error": "old_text is not unique in file - include more surrounding context"}

    executor.write_file(path, content.replace(old_text, new_text, 1))
    return {"success": True}