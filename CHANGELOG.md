# Changelog

All notable changes to gitgud will be documented in this file.

## [0.0.1] - 2025-12-11

Initial release.

### Features

- **Multi-source installation**
  - Registry: `gitgud install @org/repo/skill` (claude-plugins.dev)
  - GitHub: `gitgud install gh:owner/repo/path`
  - Local: `gitgud install ./path/to/skill`

- **Skill discovery**
  - `gitgud list` - view installed skills
  - `gitgud show <name>` - display skill with base directory
  - `gitgud search <term>` - find skills by keyword
  - `gitgud path <name>` - get skill directory path

- **Management**
  - `gitgud install` / `gitgud uninstall`
  - `gitgud init` - setup with AGENTS.md snippet
  - `--local` / `--global` scope flags
  - `--json` output format

- **Claude Code compatible**
  - Works with `~/.claude/skills/` and `.claude/skills/`
  - Precedence: local .claude → local .gitgud → global .claude → global .gitgud

- **Standalone binaries**
  - macOS (arm64, x64)
  - Linux (x64, arm64)
  - No runtime dependencies

### Installation

```bash
# Quick install
curl -fsSL https://raw.githubusercontent.com/yesh/gitgud/main/install.sh | bash

# Or via npm/bun
npx gitgud-skills
bun install -g gitgud-skills
```
