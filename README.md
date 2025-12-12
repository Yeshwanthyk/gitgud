# gitgud

[![npm version](https://img.shields.io/npm/v/gitgud-skills.svg)](https://www.npmjs.com/package/gitgud-skills)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

CLI for managing AI agent skills. Multi-source installation, Claude Code compatible.

## Installation

**Quick install (recommended)**
```bash
curl -fsSL https://raw.githubusercontent.com/Yeshwanthyk/gitgud/main/install.sh | bash
```

**npx (no install needed)**
```bash
npx gitgud-skills list
```

**npm / bun**
```bash
npm install -g gitgud-skills
bun install -g gitgud-skills
```

## Quick Start

```bash
# Install a skill from claude-plugins registry
gitgud install @anthropics/claude-code/frontend-design

# Install from GitHub
gitgud install gh:anthropics/claude-code/plugins/pdf/skills/pdf

# Install from local folder
gitgud install ./path/to/skill

# List installed skills
gitgud list

# Search skills
gitgud search pdf

# Load a skill (for agents)
gitgud show pdf
```

## Why gitgud?

| Feature | gitgud | claude-plugins | openskills |
|---------|--------|----------------|------------|
| Registry install | Yes | Yes | No |
| GitHub install | Yes | Yes | Yes |
| Local install | Yes | No | No |
| Search skills | Yes | No | No |
| JSON output | Yes | No | No |
| Standalone binary | Yes | No | No |
| Update tracking | Yes | No | No |
| Claude Code compat | Yes | Yes | Yes |

## Commands

| Command | Description |
|---------|-------------|
| `gitgud list` | List installed skills |
| `gitgud show <name>` | Display skill content with base directory |
| `gitgud search <query>` | Search skills by keyword |
| `gitgud path <name>` | Print skill directory path |
| `gitgud install <source>` | Install from registry, GitHub, or local |
| `gitgud uninstall <name>` | Remove a skill |
| `gitgud init` | Setup and print AGENTS.md snippet |

**Options:** `--local`, `--global`, `--json`

## Install Sources

```bash
# claude-plugins.dev registry
gitgud install @anthropics/claude-code/frontend-design

# GitHub shorthand
gitgud install gh:owner/repo/path/to/skill

# GitHub URL
gitgud install https://github.com/owner/repo/tree/main/skills/my-skill

# Local directory
gitgud install ./my-skill
```

## Directory Structure

```
~/.gitgud/skills/           # Global gitgud skills
~/.claude/skills/           # Global Claude Code skills
.gitgud/skills/             # Project-local gitgud skills
.claude/skills/             # Project-local Claude Code skills
```

**Precedence** (highest wins): local .gitgud → global .gitgud → local .claude → global .claude

## For AI Agents

gitgud supports progressive disclosure:

1. `gitgud list` - discover available skills
2. `gitgud search <term>` - find relevant skills
3. `gitgud show <name>` - load full instructions

The `show` output includes the skill's base directory for resolving bundled resources (scripts/, references/, assets/).

Run `gitgud init --local` to get an AGENTS.md snippet.

## License

Apache-2.0
