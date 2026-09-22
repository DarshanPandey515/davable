"""Scaffold-time project files.

Kept free of Django/agent imports so the Tailwind entry guard can be checked
on its own (see tests_scaffold.py).
"""

VITE_CONFIG_CONTENT = """
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // E2B serves the preview from *.e2b.app hosts.
    allowedHosts: ['.e2b.app'],
  },
})
"""

TAILWIND_IMPORT = '@import "tailwindcss";'

# The create-vite template ships index.css/App.css full of opinionated styles
# (dark background, centered #root) and no Tailwind entry, so the plugin emits
# nothing and every utility class is inert. Replace the entry and neutralize
# App.css so generated apps start from a clean Tailwind slate.
INDEX_CSS_CONTENT = f"""{TAILWIND_IMPORT}

html,
body,
#root {{
  height: 100%;
}}

body {{
  margin: 0;
}}
"""


def ensure_tailwind_css(executor) -> None:
    """Guarantee src/index.css has the Tailwind v4 entry point.

    Codegen may rewrite index.css (or skip it), so re-check before building.
    """
    try:
        content = executor.read_file("src/index.css")
    except FileNotFoundError:
        content = ""
    if TAILWIND_IMPORT not in content and "@import 'tailwindcss'" not in content:
        executor.write_file("src/index.css", INDEX_CSS_CONTENT if not content else f"{TAILWIND_IMPORT}\n{content}")
