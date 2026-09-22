import logging
from typing import List

from pydantic import BaseModel, Field

from .llm import structured_completion
from agents.system import CODEGEN_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class ProjectFile(BaseModel):
    path: str = Field(description="File path relative to the project root, e.g. src/components/TodoForm.jsx")
    content: str = Field(description="Complete, final content of the file")


class ProjectFiles(BaseModel):
    files: List[ProjectFile] = Field(description="Every file needed to complete the app, each written once")


def run_codegen(brief: str, todos: list) -> List[ProjectFile]:
    todos_text = "\n".join(f"- {t}" for t in todos)
    prompt = f"Build: {brief}\n\nSteps:\n{todos_text}"

    logger.info(f"Running codegen for: {brief}")
    result = structured_completion(CODEGEN_SYSTEM_PROMPT, prompt, ProjectFiles, "project_files", max_completion_tokens=4096)
    return result.files