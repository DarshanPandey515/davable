import logging
from typing import Literal

from pydantic import BaseModel, Field

from .llm import structured_completion
from .system import PLANNER_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


class Plan(BaseModel):
    type: Literal["clarification", "execute"] = Field(
        description="'clarification' if the request is too vague to build without more detail, else 'execute'"
    )
    questions: list[str] = Field(
        default_factory=list,
        description="Only used when type is 'clarification' - 1-3 short clarifying questions. Empty otherwise.",
    )
    brief: str = Field(
        default="",
        description="Only used when type is 'execute' - one sentence summary of what will be built. Empty otherwise.",
    )
    todos: list[str] = Field(
        default_factory=list,
        description="Only used when type is 'execute' - 3-6 short, concrete build steps. Empty otherwise.",
    )


def run_planner(prompt):
    logger.info(f"Running planner for: {prompt}")

    try:
        plan = structured_completion(PLANNER_SYSTEM_PROMPT, prompt, Plan, "plan", max_completion_tokens=512)
    
    except Exception as e:
        logger.error(f"Planner error: {e}", exc_info=True)
        return {"type": "execute", "brief": prompt, "todos": []}

    if plan.type == "clarification":
        return {"type": "clarification", "questions": plan.questions}

    return {"type": "execute", "brief": plan.brief, "todos": plan.todos}