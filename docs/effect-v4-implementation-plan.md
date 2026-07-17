# Effect v4 migration implementation plan

## Orientation

gitgud will move from loosely connected Promise-based commands to Effect-native workflows with one runtime boundary. The migration is not a wrapper around the current async functions. Each migrated path changes end to end: CLI input, command workflow, external services, typed failures, state transition, result rendering, and tests.

At the same time, the state model changes. The Profile, Resolution Lock, and managed skills become one atomic Generation. GitHub, local, and registry-resolved skills all follow the same tracked and pinned lifecycle. Agent directories remain derived Projections.

Effect v4 is still beta. Pin matching versions exactly, isolate unstable APIs, and do not release intermediate mixed-state builds. Implementation proceeds in reviewable vertical slices, but the breaking public release happens only after every state-changing command uses the Generation model.

Source of truth for correctness: [`docs/effect-v4-invariants.md`](./effect-v4-invariants.md).

## Settled scope

Included:

- Effect v4 runtime, services, Layers, typed failures, and output boundary.
- Atomic Generation storage, migration, locking, recovery, and retention.
- Filtered content-addressed skill snapshots.
- GitHub and private-repository source handling.
- Local and registry-resolved tracked sources.
- Source, skill, profile, cache, archive, and sync workflows.
- Global/project Scope overlay.
- Breaking grouped CLI and structured output.
- Dry runs, non-TTY behavior, interruption handling, and Projection degradation.

Excluded:

- Self-update migration or checksum/signature work.
- Fsync-grade power-loss guarantees.
- Live local-source mode.
- Detached pins or unmanaged gitgud installs.
- Compatibility aliases for the old CLI.
- `effect/unstable/cli` adoption in the first release.

## Target flow

```text
process argv
  -> pure parse and usage validation
  -> Effect program dispatch
     -> command workflow
        -> pure parsing / validation / planning
        -> StateStore / SourceRepository / SnapshotStore / ProjectionStore
        -> stage and validate next Generation
        -> atomically publish current pointer
        -> project to agent directories
  -> pure result/error rendering
  -> terminal write and exit status
  -> BunRuntime.runMain (only interpreter)
```

A read-only command stops before mutation. A dry run stops after planning. A failed mutation before publication leaves the old Generation current. A Projection failure after publication returns exit `3`; interruption returns `130` even if publication already happened.

## Target contracts

### State

Introduce Profile and Resolution Lock v2 because sources are no longer GitHub-only and upstream availability is separate from the pin.

```ts
type SkillSource = GithubSource | LocalSource | RegistrySource

type SelectionState = "enabled" | "disabled"
type Availability = "present" | "removed-upstream"

type LockedSkill = {
  readonly id: string
  readonly sourceId: string
  readonly name: string
  readonly subpath: string
  readonly availability: Availability
  readonly contentHash: string
  readonly resolvedCommit?: string
  readonly resolvedAt: string
}

type GenerationManifest = {
  readonly version: 1
  readonly id: string
  readonly createdAt: string
  readonly previous?: string
}
```

The exact serialized shape belongs in schema tests before implementation. No code may infer pin validity from `availability === "present"`; a removed-upstream pin remains valid while its snapshot exists.

### Command result

```ts
type ExitCode = 0 | 1 | 2 | 3 | 130

type CommandOutcome = {
  readonly result: CommandResult
  readonly projection: "not-needed" | "succeeded" | "degraded"
  readonly committedGeneration?: string
}

type RenderedOutput = {
  readonly stdout?: string
  readonly stderr?: string
  readonly exitCode: ExitCode
}
```

### Services

Use Effect services only for external ownership boundaries:

- `RuntimeContext`: cwd, home, environment, TTY state, platform, and exit-status setter.
- `StateStore`: read effective state, lock one Scope, recover staging, prepare, publish, and retain Generations.
- `SourceRepository`: resolve/fetch GitHub, read local sources, and resolve registry entries without exposing credentials.
- `SnapshotStore`: filter, hash, validate, persist, read, and garbage-collect immutable skill snapshots.
- `ProcessRunner`: scoped argv-based child processes with captured output and typed exit failures.
- `ProjectionStore`: plan and apply owned links for supported agents.
- `Terminal`: interactive selection, progress, and final output transport.

Keep profile/lock parsing, reconciliation, source normalization, conflict detection, overlay calculation, ignore matching, rendering, and version comparison as pure functions.

## Implementation chunks

### 0. Lock the contracts with tests

**Behavior delivered**

The current bugs and the settled public contract become executable tests before the owning implementation changes.

**Files**

- Extend `test/core/materialize.test.ts`.
- Extend `test/core/source-manager.test.ts` and `test/sources/github.test.ts`.
- Add `test/commands/cli-contract.test.ts`.
- Add fixtures for multi-skill repositories, removed-upstream pins, ignored files, escaping symlinks, and local sources.

**First red cases**

- Two skill paths from the same repo/commit never overwrite each other.
- `node_modules`, `.git`, and `.gitgudignore` matches never enter hashes, snapshots, materialization, or archives.
- Escaping symlinks are rejected; contained links round-trip.
- Removed-upstream enabled pins continue materializing.
- Non-TTY multi-skill mutation without explicit intent is usage failure with no state change.
- Existing command-level `process.exit` and mixed output are detectable.

**Verification**

- Existing 79 tests stay green before each new red test is introduced.
- Each red test turns green only in its owning chunk.

**Risk**

Do not encode current destructive behavior as desired behavior. Test the invariant, not the existing implementation.

### 1. Add the Effect runtime shell and migrate `status`

**Behavior delivered**

One Effect runtime/output boundary exists, typed failures render consistently, and `status` is the first complete read-only Effect path.

**Files and symbols**

- `package.json`, `bun.lock`: exact matching `effect` and `@effect/platform-bun` beta pins.
- `src/cli.ts`: keep pure argument parsing; add sole `BunRuntime.runMain` composition.
- Add `src/runtime/program.ts`, `src/runtime/errors.ts`, `src/runtime/layers.ts`, `src/runtime/context.ts`.
- `src/output.ts`: pure `renderResult` and `renderError`.
- `src/commands/status.ts`: return semantic data or typed failure; remove local output and exit behavior.
- `src/core/colors.ts`: receive terminal capabilities rather than reading process globals.

**Execution path**

`argv -> parse -> status Effect -> StateStore read adapter -> status result -> renderer -> terminal -> exit`.

**Verification**

- Text and JSON status success.
- Usage exit `2`, operation/defect exit `1`, interruption `130`.
- JSON emits one document.
- No nested runner or command-level process exit.
- Bun source and compiled-binary smoke tests.

**Risk**

Do not wrap the old `statusCommand` in `Effect.tryPromise`. Replace its contract through the full path.

### 2. Introduce Generation storage and one-time migration

**Behavior delivered**

Profile, Resolution Lock, and managed skills can be read and published as one Generation. Existing state migrates safely. Writers fail immediately when a Scope is busy.

**Files and symbols**

- Add `src/state/schema.ts`, `src/state/generation.ts`, `src/state/store.ts`, `src/state/migrate.ts`, `src/state/overlay.ts`.
- Refactor pure schemas from `src/core/profile.ts` and `src/core/lockfile.ts` into v1 readers and v2 models.
- `src/core/paths.ts`: Generation, staging, lock, backup, and retention paths.
- Keep `applyDiscoveryToLock` pure, updated for availability separate from pin validity.

**State transition**

1. Acquire Scope lock or fail busy.
2. Recover abandoned staging.
3. Read current Generation or validated legacy state.
4. Build and validate a complete next Generation.
5. Rename staged Generation into the retained set.
6. Atomically switch `current`.
7. Keep current and previous Generations protected.

**Verification**

- Fault injection before and after every write/rename.
- Failure before commit preserves old state.
- Interruption cleanup leaves no publishable partial state.
- Busy Scope fails immediately.
- Startup removes abandoned staging but never switches state.
- Legacy migration preserves a backup and switches only after validation.
- Global/project overlay behavior and same-Scope name conflicts.

**Risk**

Once a Generation writer is enabled in public dispatch, no legacy mutating command may write profile, lock, or managed skills directly. Do not publish intermediate mixed-state builds.

### 3. Build filtered snapshots and GitHub source access

**Behavior delivered**

GitHub refs resolve to exact commits, repositories are downloaded only into scoped temporary storage, and discovered skills become small immutable content-addressed snapshots. Private repositories use existing credentials without persisting secrets.

**Files and symbols**

- Split `src/sources/github.ts` into pure source parsing/discovery and Effect adapters.
- Add `src/core/ignore.ts`, `src/core/snapshot.ts`.
- Add `src/services/source-repository.ts`, `src/services/snapshot-store.ts`, `src/services/process-runner.ts`.
- Replace callback `spawn` Promise wrappers with the isolated Effect process adapter.

**Execution path**

`resolve ref -> temporary download -> discover -> apply filters -> validate links -> hash -> persist missing snapshot -> discard repository temp`.

**Verification**

- Exact commit pin and no unresolved-ref fallback.
- Public and private repository paths; credentials never appear in output/state.
- Rate limit, auth, bad ref, HTTP, tar, and schema failures keep distinct tags.
- Temporary cleanup on failure/interruption.
- Same repo/commit with multiple source subpaths.
- Large unrelated repository content is not retained.
- Repeated content reuses one snapshot by hash.

**Risk**

The v4 HTTP and process modules are unstable. Keep them behind local interfaces so beta upgrades do not spread through use cases.

### 4. Implement source and skill lifecycle commands

**Behavior delivered**

The grouped breaking CLI manages all GitHub, local, and registry-resolved skills through one tracked/pinned lifecycle.

**Files and symbols**

- Add or reshape `src/commands/source.ts` and `src/commands/skill.ts`.
- Replace flows in `src/commands/add.ts`, `select.ts`, `install.ts`, `uninstall.ts`, `apply.ts`, and source-update parts of `update.ts`.
- Refactor `src/core/source-manager.ts` into Effect workflows plus pure reconciliation.
- Extend source/profile/lock schemas for GitHub, local, and registry provenance.

**Command behavior**

- `source add`: discover and track; non-TTY requires `--all`, `--enable`, or `--track-only`.
- `source update`: advance present tracked pins, keep removed-upstream pins, add new skills disabled.
- `source remove`: confirm or force, then remove the source and all owned pins.
- `skill enable` / `skill disable`: change Selection without discarding pins.
- Every mutation supports dry run.

**Verification**

- Upstream removal followed by update still materializes the old enabled snapshot.
- Reappearing skills and changed content have deterministic reconciliation.
- Local edits do nothing until explicit update.
- Missing local source fails before publication.
- Registry resolution enters the same state model.
- Source removal and skill disable have different, durable outcomes.
- No command mutates bytes without changing authoritative state.

**Risk**

Do not preserve the old `uninstall` physical-delete meaning or the old ambiguous update surface.

### 5. Rebuild materialization and Projection

**Behavior delivered**

Managed skill files come only from the committed Generation. Global and project-local state project to the correct agent locations. Projection failure is visible and retryable.

**Files and symbols**

- Split `src/core/materialize.ts` into a pure Generation materialization plan and Effect execution during staging.
- Split `src/commands/sync.ts` into pure Projection planning/rendering and `ProjectionStore` execution.
- Update `src/core/skills.ts` and `src/core/paths.ts` for effective global/project discovery.
- Remove silent `autoSync`.

**Execution path**

`publish Generation -> compute effective global/project skills -> plan owned links -> apply per agent -> success or Degraded Commit`.

**Verification**

- Reconciliation never deletes user-owned agent entries.
- Managed stale links prune; user-owned links remain.
- Local override and local disable shadow global intent.
- Projection is idempotent and retry converges.
- Partial agent failure returns exit `3` and preserves committed state.
- Interrupt after commit returns `130` and reports sync recovery.
- `--force` affects only the explicit conflict.

**Risk**

Never roll back a committed Generation after partially updating multiple agent directories.

### 6. Profiles, complete archives, cache GC, local and registry completion

**Behavior delivered**

Profiles reproduce exact locks, archives are portable full backups, and cache cleanup is explicit and safe.

**Files and symbols**

- Rewrite `src/commands/profile.ts` around Generation state.
- Evolve `src/core/skill-archive.ts` and `src/commands/export.ts` / `import.ts` into complete archive workflows under the new command surface.
- Add `src/commands/cache.ts`.
- Finish `src/sources/local.ts` and `src/sources/registry.ts` as tracked SourceRepository adapters.

**Behavior**

- Profile export remains a manifest.
- Profile apply uses the exported lock and does not refresh.
- Missing local paths fail before mutation.
- Complete archive contains Profile, Resolution Lock, and every filtered pin.
- Archive import needs no original source and publishes one Generation.
- `cache gc` removes only content outside current/previous Generations and active pins.

**Verification**

- Apply the same Profile twice and get the same pins.
- Import an archive after making the original source unavailable.
- Disabled and removed-upstream pins survive archive round trip.
- Archive contains no cache, `.git`, `node_modules`, ignored files, or escaping links.
- Forced export never destroys the old archive before replacement succeeds.
- GC dry run and real run agree; referenced snapshots survive.

**Risk**

Profile and archive formats have different portability guarantees. Keep their commands and output explicit.

### 7. Finish the breaking CLI and remove legacy paths

**Behavior delivered**

Every command follows the same Effect, state, output, and exit contracts. Documentation and release artifacts match the implementation.

**Files and symbols**

- `src/cli.ts`: final grouped `source`, `skill`, `profile`, and `cache` dispatch.
- Remove superseded flat command modules or leave thin pure delegates only where names still exist in the new surface.
- `README.md`, `CHANGELOG.md`, CLI help, release workflow, and tests.
- Keep `self-update` on its existing implementation path, outside Generation services, while still conforming to the final output contract only if touched safely.

**Repository audits**

```bash
rg 'process\.(exit|stdout|stderr)' src
rg 'Effect\.(runPromise|runPromiseExit|tryPromise)' src
rg 'new Promise' src
rg 'node_modules|\.gitgudignore' src test
```

Every remaining match needs a documented boundary reason.

**Verification**

- `bun test` and `bun run check`.
- All four compiled targets build.
- CLI smoke matrix for text/JSON and exits `0`, `1`, `2`, `3`, `130`.
- Migration test from the latest released legacy state.
- README command examples execute against the built binary.
- No compatibility aliases for the old command surface.

**Risk**

This is a breaking release. Do not tag it until the migration, CLI, archive, and rollback tests pass together.

## Verification matrix

| Contract | Unit proof | Integration proof |
|---|---|---|
| One interpreter/output boundary | command effects and pure renderers | compiled CLI exits/output |
| Atomic Generation publication | faulting StateStore tests | temp-filesystem interruption/recovery |
| Pin survives upstream removal | pure lock reconciliation | source update then materialize |
| Small cache | ignore/hash/snapshot tests | large repo with small skill subtree |
| Private GitHub safety | redaction and auth error tests | credential-backed private fixture when available |
| Scope overlay | pure effective-state tests | global + project sync fixture |
| Projection degradation | planner and result tests | one writable and one failing agent target |
| Non-TTY intent | parse/usage tests | piped CLI smoke test |
| Portable archive | manifest/archive validation | restore without source access |
| GC safety | reference graph tests | current/previous retention fixture |

## Rollout

1. Develop and review chunks separately, but do not release a build where legacy mutators and Generation mutators are both public.
2. Run the one-time migration against copied real-world `~/.gitgud` fixtures, including old direct local/registry installs.
3. Produce a breaking pre-release and exercise every supported platform binary.
4. Publish the release with migration notes, the new grouped command table, backup/rollback steps, and the Effect beta pin.
5. Keep the legacy backup until the new release has completed at least one successful subsequent Generation publication; removal remains manual for this release.

## Residual risks

- Effect v4 and its HTTP/process APIs can change between beta releases.
- Bun signal, raw terminal, rename, and compiled-binary behavior need platform smoke tests.
- Private GitHub authentication differs across user environments.
- Atomic visibility does not guarantee survival of sudden power loss until fsync behavior is designed and tested.
- A complete archive can still be large when skills intentionally contain large assets, although dependency and ignore filtering limit accidental growth.

## Open decisions

None block implementation. Lower-level choices such as `.gitgudignore` matcher library, exact v2 JSON field names, lock-file mechanism, and private GitHub credential adapter should be chosen inside their owning chunk without weakening the settled invariants.
