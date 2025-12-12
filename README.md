# gitgud

CLI for managing AI agent skills. Multi-source installation, Claude Code compatible.

## Installation

### Quick Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/yesh/gitgud/main/install.sh | bash
```

This downloads the correct binary for your system and installs to `~/.local/bin`.

### Other Methods

**npx (no install needed)**
```bash
npx gitgud-skills list
npx gitgud-skills install @anthropics/claude-code/frontend-design
```

**bun**
```bash
bun install -g gitgud-skills
```

**npm**
```bash
npm install -g gitgud-skills
```

**Manual download**

Download the binary for your platform from [releases](https://github.com/yesh/gitgud/releases):
- `gitgud-darwin-arm64` - macOS Apple Silicon
- `gitgud-darwin-x64` - macOS Intel
- `gitgud-linux-x64` - Linux x64
- `gitgud-linux-arm64` - Linux ARM64

```bash
chmod +x gitgud-*
sudo mv gitgud-* /usr/local/bin/gitgud
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
| Registry install | ✅ | ✅ | ❌ |
| GitHub install | ✅ | ✅ | ✅ |
| Local install | ✅ | ❌ | ❌ |
| Search skills | ✅ | ❌ | ❌ |
| JSON output | ✅ | ❌ | ❌ |
| Standalone binary | ✅ | ❌ | ❌ |
| Update tracking | ✅ | ❌ | ❌ |
| Claude Code compat | ✅ | ✅ | ✅ |

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

### Options

- `--local` - Use project-local registry (`.gitgud/skills/`)
- `--global` - Use global registry (`~/.gitgud/skills/`)
- `--json` - Output as JSON

## Install Sources

```bash
# claude-plugins.dev registry
gitgud install @anthropics/claude-code/frontend-design

# GitHub shorthand
gitgud install gh:owner/repo/path/to/skill

# GitHub URL (supports /tree/<ref>/<path>)
gitgud install https://github.com/owner/repo/tree/main/skills/my-skill

# Local directory
gitgud install ./my-skill
gitgud install /absolute/path/to/skill
```

## Directory Structure

**Global** (`~/.gitgud/skills/`)
```
~/.gitgud/skills/
  pdf/
    SKILL.md
    .gitgud-meta.json    # tracks install source
    scripts/             # optional resources
```

**Local** (`.gitgud/skills/`)
```
project/
  .gitgud/skills/
    my-skill/
      SKILL.md
```

### Precedence

Skills are searched in order (later wins):
1. `.claude/skills/` (local)
2. `.gitgud/skills/` (local)
3. `~/.claude/skills/` (global)
4. `~/.gitgud/skills/` (global)

This means gitgud skills override Claude Code skills of the same name.

## For AI Agents

gitgud supports progressive disclosure:

1. **Discover**: `gitgud list` shows available skills
2. **Search**: `gitgud search <term>` finds relevant skills  
3. **Load**: `gitgud show <name>` outputs full instructions

The `show` output includes the skill's base directory:
```
Skill: pdf
Base: /Users/you/.gitgud/skills/pdf

---
name: pdf
description: Extract and manipulate PDFs
---
[instructions...]
```

Agents can use the `Base` path to locate bundled resources (`scripts/`, `references/`, `assets/`).

### AGENTS.md Integration

Run `gitgud init` to get a snippet for your AGENTS.md:

```bash
gitgud init --local   # also creates .gitgud/skills/
```

## Development

```bash
git clone https://github.com/yesh/gitgud
cd gitgud
bun install
bun test
bun run dev  # watch mode
```

### Building

```bash
bun run build           # JS bundle
bun run build:binary    # standalone binary (current platform)
bun run build:all       # all platform binaries
```

## License

Apache-2.0
