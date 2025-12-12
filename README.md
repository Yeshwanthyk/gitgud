# gitgud

CLI for managing AI agent skills. Multi‑source installation, Claude Code compatible.

`gitgud` helps you install, organize, and load “skills” — small, structured instruction packs for AI agents. Skills live in a simple folder layout (`SKILL.md` + optional resources) and can be sourced from:

- The claude‑plugins registry (`claude-plugins.dev`)
- GitHub repos / subdirectories
- Local folders

It is designed to work with Claude Code’s skills system, while adding registry + search + local install support.

## Quick start

### Install

Once published:

```bash
bun install -g gitgud-skills
# or
npx gitgud-skills
```

From source (this repo):

```bash
bun install
bun run build
./dist/cli.js --help
```

### Use

```bash
# Install a skill from claude‑plugins registry
gitgud install @anthropics/claude-code/frontend-design

# Install from GitHub (shorthand)
gitgud install gh:anthropics/claude-code/plugins/pdf/skills/pdf

# Install from a full GitHub URL (supports /tree/<ref>/<subdir>)
gitgud install https://github.com/anthropics/claude-code/tree/main/plugins/pdf/skills/pdf

# Install from local folder
gitgud install ./path/to/skill

# List installed skills (merged from all registries)
gitgud list

# Search installed skills
gitgud search pdf

# Load a skill (for agents)
gitgud show pdf
```

## Features

### Why gitgud?

| Feature | gitgud | claude‑plugins | openskills |
|---------|--------|----------------|------------|
| Registry install | ✅ claude‑plugins.dev | ✅ | ❌ |
| GitHub install | ✅ | ✅ | ✅ |
| Local install | ✅ | ❌ | ❌ |
| Search skills | ✅ | ❌ | ❌ |
| JSON output | ✅ | ❌ | ❌ |
| Update tracking | ✅ (`.gitgud-meta.json`) | ❌ | ❌ |
| Claude Code compat | ✅ | ✅ | ✅ |

## Concepts

### What is a skill?

A skill is a directory containing:

- `SKILL.md` — required Markdown file with YAML frontmatter:
  ```yaml
  ---
  name: pdf
  description: "Extract and summarize PDFs"
  triggers:
    - "pdf"
    - "document"
  ---
  ```
- Optional resource folders (e.g., `scripts/`, `assets/`, `references/`).

`gitgud` parses the frontmatter to build a skill index.

### Registries and precedence

`gitgud` looks for skills in four places:

1. Local Claude registry: `<project>/.claude/skills`
2. Local gitgud registry: `<project>/.gitgud/skills`
3. Global Claude registry: `~/.claude/skills`
4. Global gitgud registry: `~/.gitgud/skills`

When skills share the same name, **later locations override earlier ones**. Current precedence (highest wins):

1. `~/.gitgud/skills`
2. `~/.claude/skills`
3. `<project>/.gitgud/skills`
4. `<project>/.claude/skills`

This means a globally installed gitgud skill will shadow a local Claude skill of the same name. If you want local/project skills to win, install them under `.gitgud/skills` and avoid duplicates in global registries.

## Commands

Run `gitgud <command> -h` for command help. All commands support:

- `--format text|json` or `--json` for JSON output
- `--local` or `--global` where relevant

### `gitgud list`

List installed skills.

```bash
gitgud list               # merged list from all registries
gitgud list --local       # only local registries
gitgud list --global      # only global registries
gitgud list --json
```

### `gitgud show <name>`

Print a skill’s full instructions. Text output includes its base directory:

```bash
gitgud show pdf
gitgud show pdf --json
```

Text output shape:

```
Skill: pdf
Base: /abs/path/to/skills/pdf

---
<contents of SKILL.md>
```

### `gitgud path <name>`

Print the resolved filesystem path for a skill:

```bash
gitgud path pdf
gitgud path --name pdf
```

### `gitgud search <query>`

Search across installed skills’ names, descriptions, and `SKILL.md` lines:

```bash
gitgud search "frontend"
gitgud search pdf --json
```

### `gitgud install <source>`

Install a skill into either the local or global gitgud registry.

Sources:

- Registry identifier: `@owner/repo/skill` (optionally `@owner/repo/skill@version`)
- GitHub shorthand: `gh:owner/repo/path/to/skill`
- GitHub URL: `https://github.com/owner/repo/tree/<ref>/<path>`
- Local path: `./some/dir` or `/abs/dir`

Examples:

```bash
gitgud install @anthropics/claude-code/frontend-design
gitgud install gh:anthropics/claude-code/plugins/pdf/skills/pdf
gitgud install ./skills/pdf

gitgud install ... --local     # into <project>/.gitgud/skills
gitgud install ... --global    # into ~/.gitgud/skills (default)
gitgud install ... --json
```

Each installed skill gets a `.gitgud-meta.json` with `source` and `installedAt`.

### `gitgud uninstall <name>`

Remove a skill from the local or global gitgud registry:

```bash
gitgud uninstall pdf
gitgud uninstall pdf --local
gitgud uninstall pdf --json
```

### `gitgud init`

Create the skills directory (local or global) and print an AGENTS.md snippet for agent use:

```bash
gitgud init           # initializes global ~/.gitgud/skills
gitgud init --local   # initializes <project>/.gitgud/skills
```

## Directory structure

Global:

```
~/.gitgud/
  skills/
    <skill>/
      SKILL.md
      .gitgud-meta.json   # only for installed skills
      scripts/            # optional
      assets/             # optional

~/.claude/
  skills/
    <skill>/
      SKILL.md
```

Local (project):

```
<project>/
  .gitgud/
    skills/
      <skill>/
        SKILL.md
  .claude/
    skills/
      <skill>/
        SKILL.md
```

## For AI agents

`gitgud` supports a progressive disclosure workflow:

1. Agent discovers skills via `gitgud list` (name + scope + description).
2. Agent searches when uncertain via `gitgud search <term>`.
3. Agent loads detailed instructions via `gitgud show <name>`.

`gitgud show` includes a **Base** path for resolving bundled resources, so agents can reference `scripts/`, `references/`, etc. relative to that directory.

To enable skills in a repo for agents, run `gitgud init --local` and add the printed snippet to your project `AGENTS.md`.

## Development

```bash
bun install
bun run dev       # watch src/cli.ts
bun run build     # dist/cli.js
bun test
```

## License

MIT (see `package.json`).
