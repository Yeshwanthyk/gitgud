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
| `gitgud update` | Self-update to latest version |

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

## Agent Skills Standard

gitgud validates every skill against the [agentskills.io specification](https://agentskills.io/llms.txt):

- `SKILL.md` must start with YAML frontmatter:
  - **Required:**
    - `name`: lowercase slug ≤64 chars (letters/numbers/hyphens, no leading/trailing/consecutive hyphens). Must match directory name.
    - `description`: plain-text summary ≤1024 characters.
  - **Optional:**
    - `license`: SPDX identifier or other text.
    - `compatibility`: environment requirements (≤500 chars).
    - `allowed-tools`: space-delimited string (e.g., `Read Grep Bash`).
    - `metadata`: string→string mapping for extra attributes.
- Unknown fields are rejected so you catch issues before distributing a skill.

This keeps installed skills spec-compliant and safe for Claude-compatible agents.

## For AI Agents

gitgud supports progressive disclosure:

1. `gitgud list` - discover available skills
2. `gitgud search <term>` - find relevant skills
3. `gitgud show <name>` - load full instructions

The `show` output includes the skill's base directory for resolving bundled resources (scripts/, references/, assets/).

Add this snippet to your `AGENTS.md` so agents load skills on demand:

```
## Agent Skills
- Run `gitgud list` / `gitgud search <term>` to discover skills.
- When a request matches a skill, run `gitgud show <name>` instead of copying SKILL.md into this file so instructions stay current.
- Treat SKILL.md like any external doc: review commands, inspect scripts, and use the printed Base path when you need bundled resources (references/, scripts/, assets/).
```

Run `gitgud init --local` to generate the snippet automatically.

## License

Apache-2.0
