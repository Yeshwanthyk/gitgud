# gitgud - Beads Task Structure

This document provides a high-level view of all tasks, their dependencies, and execution order.

## Summary

- **Total Issues**: 31
- **Epics**: 4
- **Tasks**: 27
- **Ready to Start**: 2 (gitgud-0jr, gitgud-0jr.1)

## Execution Phases

### Phase 0: Project Setup (P0)
**Epic**: `gitgud-0jr` - Project Setup and Foundation

Foundation work. Must complete before any feature development.

```
gitgud-0jr.1: Initialize Bun project with package.json     [READY - START HERE]
    ↓
    ├── gitgud-0jr.2: Configure TypeScript with strict mode
    ├── gitgud-0jr.3: Configure Biome for linting and formatting  
    └── gitgud-0jr.4: Create source directory structure
                          ↓
                          └── gitgud-0jr.6: Create test fixtures
    
gitgud-0jr.2 ──→ gitgud-0jr.5: Define core TypeScript types
```

### Phase 1: Core Modules (P0)
**Epic**: `gitgud-ot1` - Core Modules - paths, frontmatter, skills

Pure functions that commands depend on. Fully testable.

```
gitgud-ot1.1: Implement core/paths.ts
    ↓
    └── gitgud-ot1.3: Implement core/skills.ts
                          ↑
gitgud-ot1.2: Implement core/frontmatter.ts ─┘

gitgud-ot1.4: Implement output.ts (depends on types)
```

### Phase 1: Discovery Commands (P0-P1)
**Epic**: `gitgud-b6j` - Discovery Commands - list, show, path, init

The most-used commands for agent integration.

```
gitgud-b6j.1: Implement CLI entry point (cli.ts)
    ↓
    ├── gitgud-b6j.2: Implement list command (+ skills.ts + output.ts)
    ├── gitgud-b6j.3: Implement show command (+ skills.ts)
    ├── gitgud-b6j.4: Implement path command (+ skills.ts)
    └── gitgud-b6j.5: Implement init command
```

### Phase 2: Installation System (P1-P2)
**Epic**: `gitgud-jih` - Installation System - sources and install/uninstall commands

Multi-source skill installation.

```
gitgud-jih.1: Add giget dependency
    ↓
    └── gitgud-jih.4: Implement GitHub source handler
                          ↓
                          └── gitgud-jih.5: Implement registry handler

gitgud-jih.2: Implement install source parsing
    ↓
    ├── gitgud-jih.3: Implement local source handler
    └── (also needed by gitgud-jih.4)

All handlers ──→ gitgud-jih.6: Implement install command

gitgud-jih.7: Implement uninstall command (independent)
```

### Phase 3: Search (P2)
`gitgud-zny` - Implement search command

Standalone task, depends only on core/skills.ts.

### Phase 4: Polish & Distribution (P2-P3)
**Epic**: `gitgud-92k` - Polish and Distribution

```
gitgud-92k.1: Write comprehensive README
gitgud-92k.2: Setup npm package publishing
gitgud-92k.3: Create compiled standalone binary
```

## Dependency Graph (Epics)

```
gitgud-0jr (Setup)
    ↓
gitgud-ot1 (Core)
    ↓
gitgud-b6j (Discovery Commands)
    ↓
gitgud-jih (Installation)
    ↓
gitgud-92k (Polish)
```

## Critical Path

The longest dependency chain (determines minimum time to completion):

```
0jr.1 → 0jr.2 → 0jr.5 → ot1.2 → ot1.3 → b6j.1 → b6j.2 → jih (epic) → 92k (epic)
```

## Parallel Work Opportunities

After `gitgud-0jr.1` completes, these can run in parallel:
- `gitgud-0jr.2` (TypeScript config)
- `gitgud-0jr.3` (Biome config)
- `gitgud-0jr.4` (Directory structure)

After core modules complete, these can run in parallel:
- `gitgud-b6j.2` (list command)
- `gitgud-b6j.3` (show command)
- `gitgud-b6j.4` (path command)
- `gitgud-b6j.5` (init command)

During Phase 2, these can run in parallel:
- `gitgud-jih.3` (local handler)
- `gitgud-jih.4` (github handler) - after giget added
- `gitgud-zny` (search command) - independent

## Quick Reference

### P0 Tasks (Critical)
| ID | Title | Blocks |
|----|-------|--------|
| gitgud-0jr.1 | Initialize Bun project | 3 tasks |
| gitgud-0jr.2 | TypeScript config | types definition |
| gitgud-ot1.1 | core/paths.ts | skills.ts |
| gitgud-ot1.2 | core/frontmatter.ts | skills.ts |
| gitgud-ot1.3 | core/skills.ts | all commands |
| gitgud-b6j.1 | CLI entry point | all commands |
| gitgud-b6j.2 | list command | - |
| gitgud-b6j.3 | show command | - |

### P1 Tasks (Important)
| ID | Title | Blocks |
|----|-------|--------|
| gitgud-0jr.4 | Directory structure | fixtures |
| gitgud-0jr.5 | TypeScript types | frontmatter, output |
| gitgud-ot1.4 | output.ts | list command |
| gitgud-jih.1 | Add giget | github handler |
| gitgud-jih.2 | Source parsing | handlers |
| gitgud-jih.6 | install command | - |

### P2-P3 Tasks (Nice to Have)
| ID | Title |
|----|-------|
| gitgud-zny | search command |
| gitgud-jih.7 | uninstall command |
| gitgud-92k.1 | README |
| gitgud-92k.2 | npm publishing |
| gitgud-92k.3 | Compiled binary |

## Commands

```bash
# See what's ready to work on
bd ready

# See what's blocked
bd blocked

# View full dependency tree for a task
bd dep tree gitgud-0jr

# Get AI execution plan
bv --robot-plan

# Start work on a task
bd update gitgud-0jr.1 --status in-progress

# Complete a task
bd close gitgud-0jr.1
```
