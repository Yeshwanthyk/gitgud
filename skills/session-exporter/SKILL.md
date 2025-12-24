---
name: session-exporter
description: Export local agent sessions to clean Markdown or HTML using a bundled script.
license: Apache-2.0
compatibility: Node.js 18+ or Bun; local session logs present.
allowed-tools: Read Grep Bash Write
metadata:
  supports: codex, claude, marvin, pi
  viewer: /Users/yesh/Documents/personal/dump/cc-view
---

# Session Exporter

Use this skill to export a local session log into a readable Markdown or HTML file.

## Workflow
1. Pick the session file path.
   - Viewer: `bun /Users/yesh/Documents/personal/dump/cc-view/server.ts` (copy the path from the UI).
   - Or locate directly: `~/.codex/sessions`, `~/.claude/projects`, `~/.config/marvin/sessions`, `~/.pi/agent/sessions`.
2. Run the exporter script from this skill's base directory.

## Commands
```bash
# Markdown
node scripts/export-session.js --input /path/to/session.jsonl --format md

# HTML
node scripts/export-session.js --input /path/to/session.jsonl --format html

# Optional flags
node scripts/export-session.js --input /path/to/session.jsonl --format md --out /tmp/session.md --title "My Session" --include-thinking --no-tools
```

## Notes
- HTML uses a CDN-hosted Markdown renderer; if offline it falls back to preformatted text.
- Tool calls and outputs are included by default; disable with `--no-tools`.
- If `--source` is omitted, the script auto-detects from the path and record shape.
