import functools
import logging
import time
from dataclasses import dataclass
from typing import Callable, Optional

from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext
from pydantic_ai.capabilities import ProcessHistory
from pydantic_ai.exceptions import ModelAPIError, ModelHTTPError, UnexpectedModelBehavior, UsageLimitExceeded
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, ToolCallPart, ToolReturnPart
from pydantic_ai.settings import ModelSettings
from pydantic_ai.usage import UsageLimits

from . import aci
from .system import FIXER_SYSTEM_PROMPT
from .llm import MODEL
from .executor import E2BExecutor
from .policy import Policy
from .project_manager import Project, project_manager
from .planner import run_planner
from .codegen import run_codegen
from .scaffold import INDEX_CSS_CONTENT, VITE_CONFIG_CONTENT, ensure_tailwind_css
from .store import ProjectState, fingerprint
from .state import (
    add_conversation_message,
    update_conversation_status,
    update_todos,
    update_preview_url,
)

logger = logging.getLogger(__name__)

# ponytail: 8 steps truncated multi-file additions (new page + router + link);
# 15 leaves room without letting a confused run burn the whole budget.
MAX_FIXER_STEPS = 15

MAX_HISTORY_MESSAGES = 10

MAX_RUN_ATTEMPTS = 3
RUN_RETRY_BACKOFF_SECONDS = 5

POLICY = Policy()


def trim_history(messages: list[ModelMessage], max_recent_messages: int) -> list[ModelMessage]:
    if len(messages) <= max_recent_messages + 1:
        return messages

    first = messages[0]
    start_idx = len(messages) - max_recent_messages

    while start_idx > 1:
        candidate = messages[start_idx]
        if isinstance(candidate, ModelRequest):
            tool_return_ids = {
                p.tool_call_id for p in candidate.parts
                if isinstance(p, ToolReturnPart)
            }
            if tool_return_ids:
                prev = messages[start_idx - 1]
                prev_call_ids = (
                    {p.tool_call_id for p in prev.parts if isinstance(p, ToolCallPart)}
                    if isinstance(prev, ModelResponse) else set()
                )
                if tool_return_ids - prev_call_ids:
                    start_idx -= 1
                    continue
        break

    return [first] + messages[start_idx:]


@dataclass
class FixDeps:
    executor: E2BExecutor
    policy: Policy
    notify: Callable[[str, dict], None]
    conversation_id: Optional[str] = None
    step: int = 0
    state: Optional[ProjectState] = None


class FixerResult(BaseModel):
    summary: str = Field(description="One or two sentences: what changed and the build result.")


fixer_agent = Agent(
    MODEL,
    deps_type=FixDeps,
    system_prompt=FIXER_SYSTEM_PROMPT,
    output_type=FixerResult,
    # A malformed tool call is recoverable feedback for the model; 2 retries
    # was too few and aborted runs that had already made the change.
    retries=4,
    # gpt-oss-120b reliably emits strict JSON at low reasoning effort
    # (planner/codegen use the same); default effort broke final parsing.
    model_settings=ModelSettings(max_tokens=2048, thinking="low"),
    capabilities=[
        ProcessHistory(
            processor=functools.partial(trim_history, max_recent_messages=MAX_HISTORY_MESSAGES)
        )
    ],
)


def _note_step(deps: FixDeps, message: str, tool_call: str) -> None:
    deps.step += 1
    deps.notify("status", {"type": "executing", "message": f"Step {deps.step}: {message}"})
    if deps.state is not None:
        deps.state.record_event("fixer", tool_call, detail=message)
    if deps.conversation_id:
        add_conversation_message(
            deps.conversation_id, "assistant", message,
            message_type="tool_call", tool_call=tool_call, hidden=True,
        )


@fixer_agent.tool
def list_dir(ctx: RunContext[FixDeps], path: str = ".", depth: int = 1) -> aci.ListDirResult:
    _note_step(ctx.deps, f"Listing: {path}", tool_call="list")
    return aci.list_dir(ctx.deps.executor, ctx.deps.policy, path, depth)


@fixer_agent.tool
def search(ctx: RunContext[FixDeps], query: str, glob: Optional[str] = None, max_results: Optional[int] = None) -> aci.SearchResult:
    _note_step(ctx.deps, f"Searching: {query}", tool_call="search")
    return aci.search(ctx.deps.executor, ctx.deps.policy, query, glob, max_results)


@fixer_agent.tool
def read_file(ctx: RunContext[FixDeps], path: str, start_line: int = 1, end_line: Optional[int] = None) -> aci.ReadFileResult:
    _note_step(ctx.deps, f"Reading: {path}", tool_call="read")
    return aci.read_file(ctx.deps.executor, ctx.deps.policy, path, start_line, end_line)


@fixer_agent.tool
def apply_patch(
    ctx: RunContext[FixDeps], path: str, base_sha256: str, old_text: str, new_text: str
) -> aci.PatchResult:
    _note_step(ctx.deps, f"Patching: {path}", tool_call="edit")
    return aci.apply_patch(ctx.deps.executor, ctx.deps.policy, path, base_sha256, old_text, new_text)


@fixer_agent.tool
def create_file(ctx: RunContext[FixDeps], path: str, content: str) -> aci.CreateResult:
    _note_step(ctx.deps, f"Creating: {path}", tool_call="write")
    return aci.create_file(ctx.deps.executor, ctx.deps.policy, path, content)


@fixer_agent.tool
def delete(ctx: RunContext[FixDeps], path: str) -> aci.DeleteResult:
    _note_step(ctx.deps, f"Deleting: {path}", tool_call="delete")
    return aci.delete(ctx.deps.executor, ctx.deps.policy, path)


@fixer_agent.tool
def exec(ctx: RunContext[FixDeps], command: str, timeout_s: Optional[int] = None) -> aci.ExecResult:
    _note_step(ctx.deps, f"Running: {command}", tool_call="bash")
    return aci.exec(ctx.deps.executor, ctx.deps.policy, command, timeout_s)


def _is_daily_quota_error(e: Exception) -> bool:
    text = str(e).lower()
    return "tpd" in text or "per day" in text or "tokens per day" in text


def _is_transient_api_error(e: Exception) -> bool:
    if isinstance(e, ModelAPIError):
        return not _is_daily_quota_error(e)
    if isinstance(e, ModelHTTPError):
        return e.status_code == 429 and not _is_daily_quota_error(e)
    return False


def scaffold_project(executor: E2BExecutor) -> dict:
    # ponytail: pinned to create-vite@6 (Vite 6) because the E2B base image
    # ships Node 20.9, while create-vite 7+ needs Node ^20.19 || >=22.12.
    # Bump the sandbox Node (custom E2B template) to unpin and use @latest.
    steps = [
        "npm create vite@6 . -- --template react",
        "npm install",
        "npm install react-router-dom",
        "npm install tailwindcss @tailwindcss/vite",
    ]

    for cmd in steps:
        result = executor.run_command(cmd)
        if not result.get("success", True):
            return result

    executor.write_file("vite.config.js", VITE_CONFIG_CONTENT)
    executor.write_file("src/index.css", INDEX_CSS_CONTENT)
    executor.write_file("src/App.css", "")
    return {"success": True}


def write_generated_files(executor: E2BExecutor, files) -> None:
    for f in files:
        executor.write_file(f.path, f.content)


def check_build(executor: E2BExecutor) -> dict:
    return executor.run_command("npm run build")


def run_fixer(
    executor: E2BExecutor,
    instruction: str,
    notify: Callable[[str, dict], None],
    conversation_id: Optional[str] = None,
    state: Optional[ProjectState] = None,
) -> str:
    deps = FixDeps(executor=executor, policy=POLICY, notify=notify, conversation_id=conversation_id, state=state)
    result = fixer_agent.run_sync(
        instruction,
        deps=deps,
        usage_limits=UsageLimits(request_limit=MAX_FIXER_STEPS),
    )
    return result.output.summary


def _fix_until_green(
    executor: E2BExecutor,
    state: Optional[ProjectState],
    notify: Callable[[str, dict], None],
    conversation_id: Optional[str],
    build_result: dict,
) -> tuple:
    """Run the fixer while the build is red, capped two ways.

    Per-error fingerprint cap stops the "same patch, same error" spin; the
    global iteration budget is the final backstop. Returns (passing, message).
    """
    output = build_result.get("output") or ""
    passing = bool(build_result.get("success", True))
    if state is not None:
        state.record_build(output, passing)
    message = ""

    while not passing:
        fp = state.build.fingerprint if state is not None else fingerprint(output)
        if state is not None:
            if state.should_escalate(fp):
                notify("status", {"type": "escalating", "message": "Same build error keeps recurring - stopping the fix loop."})
                break
            state.note_fix_attempt(fp)
        notify("status", {"type": "fixing", "message": f"Build failed, attempting fix (attempt {state.attempts.get(fp, 1) if state else 1})..."})

        context = state.projection("fixer") if state is not None else ""
        instruction = (
            "The app fails to build. Fix it.\n\n"
            f"Build output:\n{POLICY.clip(output)[0]}"
        )
        if context:
            instruction += f"\n\nCurrent project state:\n{context}"

        try:
            message = _run_with_retry(
                lambda: run_fixer(executor, instruction, notify, conversation_id=conversation_id, state=state),
                notify,
                "fixer",
            )
        except UsageLimitExceeded:
            message = "The fixer ran out of steps before the build passed."
            break
        except UnexpectedModelBehavior as e:
            # The model's tool call kept failing validation. The edit may
            # still have landed, so fall through to the build check.
            logger.warning(f"Fixer tool validation exhausted: {e}")
            message = "The fixer hit a tool error; verifying the build."
            break

        build_result = check_build(executor)
        output = build_result.get("output") or ""
        passing = bool(build_result.get("success", True))
        if state is not None:
            state.record_build(output, passing)

    return passing, message


def run_followup(prompt: str, conversation_id: str, project_id: str, notify: Callable[[str, dict], None]) -> dict:
    update_conversation_status(conversation_id, "updating")
    add_conversation_message(conversation_id, "user", prompt)
    notify("status", {"type": "updating", "message": "Applying your change..."})

    project = project_manager.get_project(project_id)
    state = project.state

    if state is not None and state.should_escalate(state.build.fingerprint):
        message = (
            "This build has failed with the same error after several fix attempts. "
            "Another patch is unlikely to help - rephrase the request or start a "
            "new conversation."
        )
        add_conversation_message(conversation_id, "assistant", message)
        update_conversation_status(conversation_id, "error")
        return {
            "success": False,
            "message": message,
            "project_id": project_id,
            "project_path": str(project.workspace),
            "preview_url": None,
        }

    snapshot = project_manager.snapshot_project(project)
    instruction = (
        "The app is already built and working. Apply this requested change, "
        "in full:\n\n"
        f"{prompt}\n\n"
        "Inspect the relevant files first. If the change needs a new page, "
        "route, or component that does not exist, create it and wire it up "
        "(react-router-dom is installed). Then verify with `exec` running "
        "\"npm run build\"."
    )
    if state is not None:
        context = state.projection("fixer")
        if context:
            instruction += f"\n\nCurrent project state:\n{context}"
        state.record_event("fixer", "apply_change", target=prompt[:80])

    try:
        message = _run_with_retry(
            lambda: run_fixer(project.executor, instruction, notify, conversation_id=conversation_id, state=state),
            notify,
            "followup",
        )
        success = True
    except UsageLimitExceeded:
        message = "Ran out of steps applying that change - try breaking it into something smaller."
        success = False
    except UnexpectedModelBehavior as e:
        # Tool-call validation exhausted, but the edit may have landed.
        # Verify the build rather than discarding the work.
        logger.warning(f"Followup tool validation exhausted: {e}")
        message = "The agent hit a tool error while applying the change; verifying the build."
        success = True
    except Exception as e:
        logger.error(f"Followup error: {e}", exc_info=True)
        message = f"Couldn't apply that change: {e}"
        success = False

    restored = False
    if success:
        build_result = check_build(project.executor)
        if build_result.get("success", True):
            if state is not None:
                state.record_build(build_result.get("output") or "", True)
        else:
            # Keep trying to repair the same change, capped by the fix loop;
            # only revert once the fixer gives up.
            passing, fix_message = _fix_until_green(
                project.executor, state, notify, conversation_id, build_result
            )
            if passing:
                message = fix_message or message
            else:
                project_manager.restore_project(project, snapshot)
                restored = True
                clipped, _ = POLICY.clip(build_result.get("output") or "")
                message = (
                    "The change broke the build and couldn't be fixed, so it was reverted.\n\n"
                    f"Build output:\n{clipped}"
                )
                success = False

    preview_url = _start_preview_server(project, notify, conversation_id) if (success or restored) else None

    add_conversation_message(conversation_id, "assistant", message)
    update_conversation_status(conversation_id, "complete" if success else "error")

    return {
        "success": success,
        "message": message,
        "project_id": project_id,
        "project_path": str(project.workspace),
        "preview_url": preview_url,
    }


def _run_with_retry(run_fn, notify: Callable[[str, dict], None], label: str):
    last_error = None
    for attempt in range(1, MAX_RUN_ATTEMPTS + 1):
        try:
            return run_fn()
        except (ModelAPIError, ModelHTTPError) as e:
            if _is_daily_quota_error(e):
                logger.error(f"{label}: daily token quota exhausted, not retrying: {e}")
                raise
            if not _is_transient_api_error(e):
                raise
            last_error = e
            logger.warning(f"{label}: transient error on attempt {attempt}/{MAX_RUN_ATTEMPTS}: {e}")
            if attempt < MAX_RUN_ATTEMPTS:
                notify("status", {
                    "type": "retrying",
                    "message": f"{label}: API hiccup, retrying (attempt {attempt + 1}/{MAX_RUN_ATTEMPTS})..."
                })
                time.sleep(RUN_RETRY_BACKOFF_SECONDS * attempt)
    raise last_error


def run_agent(prompt, conversation_id=None, emit=None):

    def notify(event_type, data):
        if emit:
            emit(event_type, data)

    logger.info(f"Starting agent with prompt: {prompt}")

    if conversation_id:
        update_conversation_status(conversation_id, "planning")
        add_conversation_message(conversation_id, "system", "Planning execution...")
    notify("status", {"type": "planning", "message": "Planning the implementation..."})

    plan = run_planner(prompt)

    if plan["type"] == "clarification":
        questions = plan.get("questions", [])
        if conversation_id:
            update_conversation_status(conversation_id, "clarification_needed")
            add_conversation_message(conversation_id, "system", f"Asking for clarification: {questions}")
        notify("clarification", {"questions": questions, "conversation_id": conversation_id})
        return {
            "success": False,
            "needs_clarification": True,
            "questions": questions,
            "conversation_id": conversation_id
        }

    todos = plan.get("todos", [])
    brief = plan.get("brief", prompt)
    if conversation_id:
        update_todos(conversation_id, todos)
        add_conversation_message(conversation_id, "system", f"Plan: {brief}")
    notify("todos", {"todos": todos, "brief": brief})

    project = project_manager.create_project()
    project_id = project.id
    executor = project.executor

    state = project.state
    if state is not None:
        state.goal = brief
        state.set_plan(todos)
        state.record_event("planner", "plan", detail=f"{len(todos)} steps")

    if conversation_id:
        update_conversation_status(conversation_id, "executing", {"project_id": project_id})
        add_conversation_message(conversation_id, "system", f"Created project {project_id}")
    notify("status", {"type": "project_created", "message": f"Created project {project_id}"})

    print(f"\n{'='*60}\nStarting new project: project_{project_id}\nWorkspace: {project.workspace}\n{'='*60}\n")

    try:
        notify("status", {"type": "scaffolding", "message": "Scaffolding project..."})
        scaffold_result = scaffold_project(executor)
        if not scaffold_result.get("success", True):
            notify("error", {"error": f"Scaffold failed: {scaffold_result.get('output')}"})
            return {"success": False, "message": "Scaffold failed", "project_id": project_id}

        if state is not None:
            state.record_event("orchestrator", "scaffold", detail="vite + react + tailwind")

        notify("status", {"type": "generating", "message": "Generating app code..."})
        files = _run_with_retry(lambda: run_codegen(brief, todos), notify, "codegen")
        if not files:
            notify("error", {"error": "The agent produced no files. Try rephrasing your request as a frontend app."})
            return {"success": False, "message": "No files generated", "project_id": project_id}
        write_generated_files(executor, files)
        ensure_tailwind_css(executor)
        notify("status", {"type": "generated", "message": f"Wrote {len(files)} files"})
        if state is not None:
            state.record_event("codegen", "generate", detail=f"Wrote {len(files)} files")

        notify("status", {"type": "building", "message": "Running build check..."})
        build_result = check_build(executor)

        passing, fixer_message = _fix_until_green(executor, state, notify, conversation_id, build_result)
        if passing:
            message = fixer_message or f"Built {brief} successfully."
            if state is not None:
                state.complete_plan()
        else:
            message = "The app was generated but the build still reports errors."

    except UsageLimitExceeded:
        notify("error", {"error": "Fixer exceeded max iterations"})
        return {"success": False, "message": "Fixer exceeded max iterations", "project_id": project_id}
    except (ModelAPIError, ModelHTTPError) as e:
        if _is_daily_quota_error(e):
            notify("error", {"error": "Daily token quota exhausted - try again after the quota resets, or upgrade tier."})
            return {"success": False, "message": "Daily token quota exhausted", "project_id": project_id}
        logger.error(f"API Error: {e}", exc_info=True)
        notify("error", {"error": f"API Error: {str(e)}"})
        return {"success": False, "message": f"API Error: {str(e)}", "project_id": project_id}
    except Exception as e:
        logger.error(f"API Error: {e}", exc_info=True)
        notify("error", {"error": f"API Error: {str(e)}"})
        return {"success": False, "message": f"API Error: {str(e)}", "project_id": project_id}

    preview_url = _start_preview_server(project, notify, conversation_id)

    if conversation_id:
        add_conversation_message(conversation_id, "assistant", message)
        update_conversation_status(conversation_id, "complete")

    return {
        "success": True,
        "message": message,
        "project_id": project_id,
        "project_path": str(project.workspace),
        "preview_url": preview_url,
    }


def _ensure_preview_config(executor: E2BExecutor) -> None:
    # Vite 6 blocks unknown Host headers. Projects scaffolded before
    # allowedHosts was added still have the old config, so patch it before
    # the dev server starts. No-op once allowedHosts is present.
    try:
        content = executor.read_file("vite.config.js")
    except FileNotFoundError:
        content = ""
    if "allowedHosts" not in content:
        executor.write_file("vite.config.js", VITE_CONFIG_CONTENT)
    # Self-heal projects scaffolded before the Tailwind entry existed.
    ensure_tailwind_css(executor)


def _start_preview_server(
    project: Project,
    notify: Callable[[str, dict], None],
    conversation_id: Optional[str] = None,
) -> Optional[str]:
    try:
        executor = project.executor
        _ensure_preview_config(executor)
        executor.sync_to_host()
        url = executor.start_server()
        project.preview_url = url
        notify("status", {"type": "server_started", "message": f"Preview ready at {url}"})
        if conversation_id:
            update_preview_url(conversation_id, url)
        return url
    except Exception as e:
        logger.warning(f"Could not start dev server: {e}")
        notify("status", {"type": "server_start_failed", "message": "Build succeeded but the preview server failed to start"})
        if conversation_id:
            update_preview_url(conversation_id, None)
        return None