# Changelog

All notable changes to gitgud will be documented in this file.

## [0.0.2] - 2025-12-12

### Changed

- **Precedence order updated**: gitgud skills now take priority over Claude skills
  - local .gitgud (highest) → global .gitgud → local .claude → global .claude (lowest)
  - Allows users to override any Claude skill with custom versions

## [0.0.1] - 2025-12-11

First release.

### New Features

- **Multi-Source Installation**: Install skills from anywhere
  - Claude-plugins registry: `gitgud install @anthropics/claude-code/frontend-design`
  - GitHub repos: `gitgud install gh:owner/repo/path/to/skill`
  - Local directories: `gitgud install ./my-skill`

- **Skill Discovery**: Find and explore your installed skills
  - `gitgud list` - View all skills with descriptions
  - `gitgud search <term>` - Search by keyword
  - `gitgud show <name>` - Load full skill content with base directory
  - `gitgud path <name>` - Get filesystem path

- **Claude Code Compatible**: Works with existing Claude skills
  - Reads from `~/.claude/skills/` and `.claude/skills/`
  - Your gitgud and Claude Code skills work together

- **Agent-Friendly Output**: Designed for AI agents
  - `gitgud show` includes base directory for resolving bundled resources
  - JSON output with `--json` flag for programmatic use
  - Progressive disclosure pattern: list → search → show

- **Standalone Binaries**: No runtime dependencies
  - macOS (Apple Silicon and Intel)
  - Linux (x64 and ARM64)
  - One-line install: `curl -fsSL https://raw.githubusercontent.com/Yeshwanthyk/gitgud/main/install.sh | bash`

### Installation

```bash
# Quick install (recommended)
curl -fsSL https://raw.githubusercontent.com/Yeshwanthyk/gitgud/main/install.sh | bash

# Or via npm/bun
npx gitgud-skills list
bun install -g gitgud-skills
```

### Technical

- Built with Bun and TypeScript
- 40 tests with full coverage of core functionality
- Apache-2.0 license
