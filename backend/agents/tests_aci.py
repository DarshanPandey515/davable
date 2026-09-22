"""Assert-based checks for the ACI + policy layer.

Run from the backend directory:  python -m agents.tests_aci
(or: python agents/tests_aci.py from the repo root)
"""

import hashlib
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents import aci
from agents.executor import E2BExecutor
from agents.policy import Policy


class FakeExecutor:
    def __init__(self, root: Path):
        self.host_workspace = root

    def write_file(self, path, content):
        target = self.host_workspace / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)

    def run_command(self, command, timeout=120):
        return {"success": True, "output": "", "exit_code": 0, "timed_out": False}

    def delete_file(self, path):
        target = self.host_workspace / path
        assert target.exists(), path
        trash = self.host_workspace / ".agent-trash" / "test"
        trash.mkdir(parents=True, exist_ok=True)
        moved = trash / target.name
        shutil.move(str(target), str(moved))
        return moved.relative_to(self.host_workspace).as_posix()


def sha(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def check(label, cond):
    if not cond:
        raise AssertionError(f"FAILED: {label}")
    print(f"ok: {label}")


def main():
    policy = Policy()
    root = Path(tempfile.mkdtemp())
    ex = FakeExecutor(root)
    ex.write_file("src/App.jsx", "".join(f"line {i}\n" for i in range(1, 11)))
    ex.write_file("src/.env", "SECRET=1\n")
    ex.write_file("src/auth.js", "function validateToken(){}\nvalidateToken();\n")
    ex.write_file("node_modules/big.js", "x")

    # path containment
    r = aci.read_file(ex, policy, "../secret.txt")
    check("traversal rejected", r.error is not None and r.error.code == "PATH_OUTSIDE_WORKSPACE")
    r = aci.read_file(ex, policy, "/etc/passwd")
    check("absolute rejected", r.error is not None and r.error.code == "PATH_OUTSIDE_WORKSPACE")

    # deny globs
    r = aci.read_file(ex, policy, "src/.env")
    check("deny glob rejected", r.error is not None and r.error.code == "DENIED_PATH")

    # read window + sha
    r = aci.read_file(ex, policy, "src/App.jsx", start_line=3, end_line=5)
    check("read window", r.error is None and r.content == "line 3\nline 4\nline 5")
    check("read sha", r.sha256 == sha((root / "src/App.jsx").read_text()))
    check("read totals", r.truncated is True and r.total_lines == 10)

    # stale version
    base = r.sha256
    ex.write_file("src/App.jsx", "changed\n")
    p = aci.apply_patch(ex, policy, "src/App.jsx", base, "line 3", "LINE 3")
    check("stale version rejected", p.error is not None and p.error.code == "STALE_VERSION")

    # ambiguous / no match
    ex.write_file("src/App.jsx", "dup\ndup\nother\n")
    base = sha((root / "src/App.jsx").read_text())
    p = aci.apply_patch(ex, policy, "src/App.jsx", base, "dup", "x")
    check("ambiguous rejected", p.error is not None and p.error.code == "AMBIGUOUS_MATCH")
    p = aci.apply_patch(ex, policy, "src/App.jsx", base, "nope", "x")
    check("no match rejected", p.error is not None and p.error.code == "NO_MATCH")

    # successful patch
    p = aci.apply_patch(ex, policy, "src/App.jsx", base, "other", "changed")
    check("patch applied", p.error is None and "changed" in (root / "src/App.jsx").read_text())
    check("patch sha", p.sha256 == sha((root / "src/App.jsx").read_text()))

    # create
    c = aci.create_file(ex, policy, "src/App.jsx", "x")
    check("create exists rejected", c.error is not None and c.error.code == "EXISTS")
    c = aci.create_file(ex, policy, "src/New.jsx", "hello")
    check("create ok", c.error is None and (root / "src/New.jsx").read_text() == "hello")

    # delete quarantine
    d = aci.delete(ex, policy, "src/New.jsx")
    check("delete ok", d.error is None and not (root / "src/New.jsx").exists())
    check("delete quarantined", any((root / ".agent-trash").rglob("New.jsx")))
    d = aci.delete(ex, policy, "src/New.jsx")
    check("delete missing", d.error is not None and d.error.code == "NOT_FOUND")

    # search
    s = aci.search(ex, policy, "validateToken")
    check("search matches", len(s.matches) == 2 and {m.line for m in s.matches} == {1, 2})
    check("search excludes node_modules", all(m.path != "node_modules/big.js" for m in s.matches))

    # list_dir
    lst = aci.list_dir(ex, policy, ".")
    names = [e.name for e in lst.entries]
    check("list excludes node_modules", "node_modules" not in names and "src" in names)

    # exec clipping
    ex.run_command = lambda command, timeout=120: {
        "success": True, "output": "x" * 100_000, "exit_code": 0, "timed_out": False,
    }
    e = aci.exec(ex, policy, "echo")
    check("exec truncated", e.truncated is True and len(e.output) <= policy.max_output_bytes + 60)

    # exec timeout flag
    ex.run_command = lambda command, timeout=120: {
        "success": False, "output": "Command timed out", "exit_code": None, "timed_out": True,
    }
    e = aci.exec(ex, policy, "sleep")
    check("exec timeout error", e.timed_out is True and e.error.code == "TIMEOUT")

    shutil.rmtree(root, ignore_errors=True)

    # real executor path policy (no sandbox needed)
    root2 = Path(tempfile.mkdtemp())
    real = E2BExecutor("policytest", root2)
    try:
        real.host_path("../x.txt")
        raise AssertionError("FAILED: executor traversal not blocked")
    except ValueError:
        check("executor traversal blocked", True)
    try:
        real.write_file("src/.env", "SECRET=1")
        raise AssertionError("FAILED: executor deny glob not blocked")
    except ValueError:
        check("executor deny glob blocked", True)
    shutil.rmtree(root2, ignore_errors=True)

    print("ALL PASSED")


if __name__ == "__main__":
    main()
