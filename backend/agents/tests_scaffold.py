"""Assert-based checks for the scaffold Tailwind entry guard.

Run from the backend directory:  python -m agents.tests_scaffold
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from agents.scaffold import INDEX_CSS_CONTENT, TAILWIND_IMPORT, ensure_tailwind_css


class FakeExecutor:
    def __init__(self, files=None):
        self.files = dict(files or {})

    def read_file(self, path):
        if path not in self.files:
            raise FileNotFoundError(path)
        return self.files[path]

    def write_file(self, path, content):
        self.files[path] = content


def check(label, cond):
    if not cond:
        raise AssertionError(f"FAILED: {label}")
    print(f"ok: {label}")


def main():
    template_css = ":root {\n  color: rgba(255, 255, 255, 0.87);\n  background-color: #242424;\n}\n"

    # missing entry -> write the full Tailwind entry
    ex = FakeExecutor()
    ensure_tailwind_css(ex)
    check("missing file gets entry", ex.files["src/index.css"] == INDEX_CSS_CONTENT)
    check("entry has tailwind import", TAILWIND_IMPORT in ex.files["src/index.css"])

    # untouched create-vite template css -> prepend, keep the rest
    ex = FakeExecutor({"src/index.css": template_css})
    ensure_tailwind_css(ex)
    check("template css gets import prepended", ex.files["src/index.css"].startswith(TAILWIND_IMPORT))
    check("template css preserved", template_css in ex.files["src/index.css"])

    # already correct -> no rewrite
    good = f'{TAILWIND_IMPORT}\nbody {{ margin: 0; }}\n'
    ex = FakeExecutor({"src/index.css": good})
    ensure_tailwind_css(ex)
    check("existing entry left alone", ex.files["src/index.css"] == good)

    # single-quoted import also counts
    single = "@import 'tailwindcss';\n"
    ex = FakeExecutor({"src/index.css": single})
    ensure_tailwind_css(ex)
    check("single-quoted import accepted", ex.files["src/index.css"] == single)

    print("ALL PASSED")


if __name__ == "__main__":
    main()
