# gitgud - Implementation Plan

## Vision

A CLI tool for managing AI agent skills. The core insight: AI coding agents (Claude Code, Cursor, Copilot) benefit from domain-specific knowledge, but there's no standard way to discover, install, and load these "skills" across tools.

**gitgud** solves this by:
1. Providing a unified skill format (folder + SKILL.md)
2. CLI for discovery (`list`, `search`, `show`)
3. Multi-source installation (local, GitHub, claude-plugins registry)
4. Global + project-local scoping
5. Agent-friendly output (text + JSON)

The name "gitgud" is a playful reference to "git gud" (get good) - helping agents get good at specific domains.

---

## Architecture

### Directory Structure

```
~/.gitgud/                    # Global installation
├── skills/                   # Installed skills
│   └── <skill-name>/
│       ├── SKILL.md          # Required: main skill file
│       ├── .gitgud-meta.json # Auto-generated: tracks install source
│       └── ...               # Optional: additional files
└── config.yaml               # Optional: custom registries (Phase 4)

.gitgud/                      # Project-local (created by --local)
└── skills/
    └── <skill-name>/
        └── ...
```

### Skill Format

Skills follow Claude Code's format - a folder with SKILL.md containing YAML frontmatter:

```markdown
---
name: skill-name
description: One-line description for list output
license: Optional license info
triggers: ["keyword1", "keyword2"]  # Optional: for smart loading
---

# Skill Content

Markdown content the agent reads when the skill is loaded.
```

### Why This Format?

1. **Compatibility**: Matches Claude Code's existing skill format
2. **Simplicity**: Just markdown files, no special tooling needed
3. **Progressive disclosure**: SKILL.md is the entry point, can link to more files
4. **Version control friendly**: Everything is text files

---

## CLI Commands

### Discovery Commands

| Command | Description | Output |
|---------|-------------|--------|
| `gitgud list` | List all installed skills | name + description per line |
| `gitgud list --json` | Machine-readable list | JSON array of skill objects |
| `gitgud list --local` | Project-local skills only | Same format |
| `gitgud list --global` | Global skills only | Same format |
| `gitgud show <skill>` | Print full SKILL.md content | Raw markdown |
| `gitgud search <term>` | Search skills by keyword | Matching lines with context |
| `gitgud path <skill>` | Print filesystem path | Absolute path |

### Installation Commands

| Command | Description |
|---------|-------------|
| `gitgud install <source>` | Install skill globally |
| `gitgud install <source> --local` | Install to project |
| `gitgud uninstall <skill>` | Remove skill |
| `gitgud uninstall <skill> --local` | Remove from project |

### Setup Commands

| Command | Description |
|---------|-------------|
| `gitgud init` | Print AGENTS.md snippet for integration |
| `gitgud init --local` | Create .gitgud/ directory in project |

### Install Sources

```bash
# Claude plugins registry (via api.claude-plugins.dev)
gitgud install @anthropics/claude-code/frontend-design

# GitHub - full URL
gitgud install https://github.com/user/skill-repo

# GitHub - shorthand (root is skill)
gitgud install gh:user/skill-repo

# GitHub - shorthand with subdirectory
gitgud install gh:user/repo/path/to/skill

# Local filesystem
gitgud install ./my-skill
gitgud install /absolute/path/to/skill
```

---

## Implementation Details

### Language & Tooling

**Bun + TypeScript**
- Fast startup (important for CLI)
- Built-in HTTP client for registry API
- `bun build --compile` for single binary distribution
- `bun:test` for testing

**Biome**
- Replaces ESLint + Prettier
- Single tool for linting + formatting
- Fast, minimal config

**Strict TypeScript**
- `noUncheckedIndexedAccess` - catches undefined access
- `exactOptionalPropertyTypes` - stricter optional handling
- Full strict mode

### Dependencies

Minimal dependencies:
- `giget` - Clone git subdirectories (same lib claude-plugins uses)
- `yaml` - Parse YAML frontmatter

No CLI framework - use Node's built-in `parseArgs`.

---

## File Structure

```
gitgud/
├── src/
│   ├── cli.ts                # Entry point, parseArgs, command dispatch
│   │
│   ├── commands/             # Command implementations (thin wrappers)
│   │   ├── list.ts           # gitgud list [--json] [--local] [--global]
│   │   ├── show.ts           # gitgud show <skill>
│   │   ├── search.ts         # gitgud search <term>
│   │   ├── path.ts           # gitgud path <skill>
│   │   ├── install.ts        # gitgud install <source> [--local]
│   │   ├── uninstall.ts      # gitgud uninstall <skill> [--local]
│   │   └── init.ts           # gitgud init [--local]
│   │
│   ├── core/                 # Core logic (pure functions, testable)
│   │   ├── paths.ts          # Resolve ~/.gitgud, .gitgud, find project root
│   │   ├── frontmatter.ts    # Parse YAML frontmatter from markdown
│   │   └── skills.ts         # Scan directories, parse skills, resolve by name
│   │
│   ├── sources/              # Install source handlers
│   │   ├── local.ts          # Copy from local filesystem
│   │   ├── github.ts         # Clone from GitHub (URL or shorthand)
│   │   └── registry.ts       # Resolve via claude-plugins API
│   │
│   ├── output.ts             # Format output (text vs JSON)
│   └── types.ts              # Shared type definitions
│
├── test/
│   ├── core/
│   │   ├── paths.test.ts
│   │   ├── frontmatter.test.ts
│   │   └── skills.test.ts
│   ├── sources/
│   │   ├── local.test.ts
│   │   ├── github.test.ts
│   │   └── registry.test.ts
│   └── fixtures/             # Test data
│       ├── sample-skill/
│       │   └── SKILL.md
│       └── malformed-skill/
│           └── SKILL.md      # Missing/invalid frontmatter
│
├── package.json
├── tsconfig.json
├── biome.json
└── README.md
```

### Design Principles

1. **Commands are thin**: Parse args → call core → format output
2. **Core is pure**: No side effects, easy to test
3. **Sources are swappable**: Easy to add new install sources
4. **Small files**: Each file has one job, easy to reason about and delete
5. **Tests mirror src**: `src/core/X.ts` → `test/core/X.test.ts`

---

## Types

```typescript
// types.ts

/** Scope determines where skills are stored/searched */
export type Scope = 'global' | 'local';

/** Parsed skill with metadata and location */
export interface Skill {
  name: string;
  description: string;
  path: string;           // Absolute path to skill directory
  scope: Scope;
  frontmatter: SkillFrontmatter;
}

/** YAML frontmatter from SKILL.md */
export interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  triggers?: string[];
}

/** Metadata stored in .gitgud-meta.json */
export interface SkillMeta {
  source: string;         // Original install source
  installedAt: string;    // ISO timestamp
}

/** Parsed install source */
export type InstallSource =
  | { type: 'local'; path: string }
  | { type: 'github'; url: string; subpath?: string }
  | { type: 'registry'; identifier: string };

/** CLI output format */
export type OutputFormat = 'text' | 'json';
```

---

## Key Behaviors

### Skill Resolution Order

When looking up a skill by name:
1. Check project-local first (`.gitgud/skills/<name>`)
2. Fall back to global (`~/.gitgud/skills/<name>`)

This allows project-local skills to shadow global ones.

### List Merging

`gitgud list` (no flags) shows both global and local, with local skills shadowing global ones of the same name. Use `--local` or `--global` to filter.

### Install Validation

Before completing install:
1. Check SKILL.md exists
2. Parse frontmatter (must have name + description)
3. Write .gitgud-meta.json with source info

### Error Handling

- Missing skill: Exit 1, print "Skill not found: <name>"
- Invalid SKILL.md: Exit 1, print parse error
- Network errors: Exit 1, print error with retry suggestion

---

## AGENTS.md Integration

Output of `gitgud init`:

```markdown
## Skills

This project has access to reusable AI agent skills via `gitgud` CLI.

### Discovery
```bash
gitgud list              # see available skills (name + description)
gitgud list --json       # machine-readable format
gitgud search <term>     # find skills by keyword
```

### Loading Skills
```bash
gitgud show <skill>      # read full skill content
gitgud path <skill>      # get path to read additional files
```

Load skills on-demand based on task requirements. Skills use progressive
disclosure - start with `gitgud show`, then explore additional files in
the skill directory if needed.
```

---

## Configuration (Phase 4)

Optional `~/.gitgud/config.yaml`:

```yaml
# Custom registries (in addition to claude-plugins)
registries:
  - name: internal
    url: https://skills.company.com/api
    
# Default scope for install
defaults:
  scope: global
```

---

## Distribution (Phase 5)

1. **npm**: `npm install -g gitgud` / `bunx gitgud`
2. **Homebrew**: `brew install gitgud`
3. **Binary**: `bun build --compile` for standalone executable

---

## Phases Summary

| Phase | Focus | Deliverables |
|-------|-------|--------------|
| 1 | Core | Project setup, paths, frontmatter, skills, list/show/path/init |
| 2 | Install | Sources (local, github, registry), install/uninstall commands |
| 3 | Discovery | search command, scope filters, merged list output |
| 4 | Polish | config.yaml, update command, shell completions, error UX |
| 5 | Distribution | npm publish, homebrew, compiled binary |
