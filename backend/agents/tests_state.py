"""Assert-based checks for the project state store.

Run from the backend directory:  python -m agents.tests_state
"""

import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.store import ProjectState, fingerprint


def check(label, cond):
    if not cond:
        raise AssertionError(f"FAILED: {label}")
    print(f"ok: {label}")


def main():
    # fingerprint normalizes the error's shape, not its line numbers
    a = "src/App.jsx:10:5 - error TS2322: Type 'string' is not assignable"
    b = "src/App.jsx:99:1 - error TS2322: Type 'string' is not assignable"
    c = "src/Other.jsx:1:1 - error TS2304: Cannot find name 'x'"
    check("fingerprint ignores line/col", fingerprint(a) == fingerprint(b))
    check("fingerprint separates errors", fingerprint(a) != fingerprint(c))
    check("fingerprint empty", fingerprint("") == "" and fingerprint("   ") == "")

    root = Path(tempfile.mkdtemp())
    st = ProjectState.load(root, "proj1")
    st.goal = "notes app"

    st.set_plan(["add notes", "list notes"])
    check("plan built", len(st.plan) == 2 and st.plan[0].owner == "codegen")

    st.record_write("src/App.jsx", "x")
    st.record_write("src/App.jsx", "y")
    check("file version bumps", st.files["src/App.jsx"].version == 2)
    check("tree version bumps", st.tree_version == 2)
    st.record_delete("src/App.jsx")
    check("delete removes file", "src/App.jsx" not in st.files)
    check("delete bumps tree", st.tree_version == 3)

    fp = st.record_build("Error: boom at line 3", False)
    check("failing build recorded", st.build.passing is False and st.build.fingerprint == fp)
    st.note_fix_attempt(fp)
    st.note_fix_attempt(fp)
    check("no escalation under cap", st.should_escalate(fp) is False)
    st.note_fix_attempt(fp)
    check("escalates at cap", st.should_escalate(fp) is True)

    st.record_build("ok", True)
    check("passing build resets iteration", st.iteration == 0 and st.build.passing is True)
    st.complete_plan()
    check("plan completed", all(s.status == "done" for s in st.plan))

    fp2 = st.record_build("Error: boom at line 7", False)
    st.note_fix_attempt(fp2)
    proj = st.projection("fixer")
    check("projection shows failing build", "FAILING" in proj)
    check("projection shows prior attempts", "Previous fix attempts" in proj)

    st.record_event("codegen", "generate", detail="Wrote 2 files")
    st.save()
    st2 = ProjectState.load(root, "proj1")
    check("state round-trips", st2.goal == "notes app" and st2.tree_version == st.tree_version)
    check("events round-trip", any(e.action == "generate" for e in st2.events))

    # a fresh workspace starts clean
    fresh = ProjectState.load(Path(tempfile.mkdtemp()), "proj2")
    check("fresh state", fresh.goal == "" and fresh.tree_version == 0 and not fresh.events)

    shutil.rmtree(root, ignore_errors=True)
    print("ALL PASSED")


if __name__ == "__main__":
    main()
