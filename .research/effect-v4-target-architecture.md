# gitgud → Effect v4: bounded target architecture

Status: architecture proposal; no implementation. Grounded in the current repository and Effect `4.0.0-beta.98` / commit `3e4abbcb0d0e9a5e82b6b88c7ef7ab69900105ec`.

## 1. Target shape

Use Effect for workflows that own asynchronous I/O, resources, interruption, or multi-step state transitions. Keep parsing, validation, planning, reconciliation, hashing input construction, and rendering as ordinary TypeScript.

The final executable has one interpreter, in `src/cli.ts`:

```ts
BunRuntime.runMain(
  program(process.argv.slice(2)).pipe(
    Effect.provide(AppLive)
  )
)
```

`program` parses, dispatches, renders one command result or one typed failure, assigns an exit status, and returns only after finalizers complete. No module below `src/cli.ts` calls `Effect.runPromise`, `Effect.runPromiseExit`, `BunRuntime.runMain`, `process.exit`, or writes directly to process stdout/stderr.

This is not an “Effect façade” over the current Promise graph. A migrated vertical slice changes its contract all the way from command handler through repositories/adapters to `Effect<A, E, R>`. Unmigrated commands remain on the legacy Promise entry path during rollout; they are not put inside `Effect.tryPromise`.

## 2. Exact current seams

| Current seam | Target responsibility |
|---|---|
| `src/cli.ts:97-142` | Keep argument grammar pure initially; return `Result<Invocation, UsageError>` rather than throw. Do not adopt `effect/unstable/cli` in the first migration. |
| `src/cli.ts:145-261` | Replace Promise/sync dispatch with `program(invocation): Effect<CommandResult, AppError, AppServices>`. |
| `src/cli.ts:266-294` | Sole final runtime boundary. Replace `.then/.catch/process.exit` with `BunRuntime.runMain`; render failures and set `process.exitCode` without abrupt exit. |
| command-local `fail`/`process.exit` in `src/commands/{add,apply,export,import,install,profile,select,status}.ts`, plus `show.ts`, `search.ts`, `sync.ts`, `uninstall.ts`, `update.ts` | Remove. Commands return semantic results or fail with tagged errors. |
| `src/core/source-manager.ts:90-150` | Keep `applyDiscoveryToLock` plain and pure. |
| `src/core/source-manager.ts:152-236` | Replace with Effect-native refresh/add/update use cases and transactional state commit. |
| `src/sources/github.ts:56-113` | Keep source normalization/parsing plain. |
| `src/sources/github.ts:119-134,246-349,394-490` | Split into Effect-native GitHub snapshot adapter, discovery I/O, and install use cases. No broad catch-to-`Result`. |
| `src/core/materialize.ts:33-71` | Keep desired-set and conflict planning plain; export it for tests. |
| `src/core/materialize.ts:73-115` | Replace destructive in-place writes with an Effect-native staged generation builder. |
| `src/core/profile.ts:31-92,118-151` and `src/core/lockfile.ts:41-162` | Keep legacy v1 readers for one-time migration; introduce plain v2 schemas for GitHub/local/registry sources and pin availability. Add cross-document validation as a pure function. |
| `src/core/profile.ts:99-115`, `src/core/lockfile.ts:170-186` | Superseded by one `StateStore` commit boundary; no independent mutation from use cases. |
| `src/core/skill-archive.ts:62-155` | Keep archive path/manifest validation plain. |
| `src/core/skill-archive.ts:72-90,161-336` | Effect-native scoped temp/process/filesystem workflow; stage output before replacing. |
| `src/commands/sync.ts:24-166,227-351` | Split pure Projection planning/rendering from filesystem execution. Preserve user-owned agent entries and `--force` rules. |
| `src/commands/sync.ts:167-225,361-392` | Effect-native projection executor. Delete silent `autoSync`; return an explicit projection outcome. |
| `src/output.ts` and command formatting helpers | Pure exhaustive renderers from `CommandResult | AppError` and `OutputFormat` to output documents. Remove reads of `process.stdout.columns`; pass terminal capabilities in. |
| `src/core/frontmatter.ts`, `src/sources/parse.ts`, pure parts of `src/core/skills.ts`, version comparison/platform mapping in `src/commands/update.ts` | Remain plain TypeScript. |

## 3. Contracts and dependency direction

### Command contract

```ts
type CommandEffect<A extends CommandResult = CommandResult> =
  Effect.Effect<A, AppError, AppServices>

type Rendered = {
  readonly stdout?: string
  readonly stderr?: string
  readonly exitCode: 0 | 1 | 2 | 3 | 130
}
```

Commands receive parsed, validated command-specific input—not `string[]` plus loose options—and return data, not preformatted strings. `renderResult` and `renderError` are plain exhaustive functions. Interactive selection is the exception: it uses `Terminal` during execution and returns `Selected | Cancelled`; cancellation is successful exit 0.

### Services

Only external ownership/substitution boundaries get service tags.

1. **`RuntimeContext`** — `cwd`, home, environment, TTY/capabilities, executable path, platform/arch, and exit-status setter. Production reads Bun/Node-compatible process globals once; tests use values. It removes `process.*` reads from `paths.ts`, `colors.ts`, output, selector, and self-update.
2. **`StateStore`** — `read(scope)`, `withMutationLock(scope, transition)`, `commit(scope, preparedGeneration)`, and startup recovery. It is the sole writer of authoritative state and current-generation publication.
3. **`GithubSnapshots`** — resolve a ref to an immutable SHA, download the repository into scoped temporary storage for discovery, and persist only immutable content-addressed skill snapshots. Resolution failure is not silently downgraded to a mutable ref.
4. **`ProjectionStore`** — plan inputs and execute managed agent-link reconciliation. It cannot delete/replace an entry without positive ownership or explicit `--force`.
5. **`ArchiveProcess`** only if the unstable process API is isolated behind a stable local contract; runs `tar` with argv, scoped handles, captured stdout/stderr, and typed exit errors.
6. **`ExitStatus`** may be a separate tiny service instead of part of `RuntimeContext`; this is useful if v4/Bun runtime exit behavior cannot be represented without `process.exitCode`.

Do not create services for profile transforms, lock reconciliation, source parsing, frontmatter, path normalization, materialization planning, version comparison, or renderers.

### Platform layers

`AppLive` is composed only at the executable boundary:

- `BunServices.layer` supplies `effect/FileSystem`, `effect/Path`, `effect/Terminal`, stdio, crypto, and `ChildProcessSpawner`.
- `FetchHttpClient.layer` supplies `HttpClient` for GitHub/registry/release requests.
- `RuntimeContextLive`, `StateStoreLive`, `GithubSnapshotsLive`, `ProjectionStoreLive`, and optional `ArchiveProcessLive` are `Layer.effect` layers with explicit requirements.
- Pin `effect` and `@effect/platform-bun` to the exact same beta version; no caret/tilde ranges.

There is no Node production layer in the bounded migration: build and runtime target Bun. Remaining `node:*` pure utilities may stay while they are not hidden Promise I/O. If Node runtime support is later required, add a separate composition root using the matching `@effect/platform-node` version; application/use-case code must not change. Tests primarily supply in-memory/fault-injecting service layers, plus small Bun filesystem integrations.

### Error algebra

Use `Data.TaggedError` for expected failures. Preserve causes; do not flatten everything to `Error.message` below the renderer.

- `UsageError { message, usage? }` → exit 2.
- `ValidationError { subject, message, cause? }` → exit 1. Includes profile/lock/archive/frontmatter/schema violations.
- `NotFoundError { resource, key, path? }` → exit 1.
- `ConflictError { resource, owners, path?, forceAllowed }` → exit 1.
- `SourceResolveError { sourceId, repo, ref, cause }` → exit 1.
- `SourceDownloadError { sourceId, url, status?, cause }` → exit 1.
- `CommandFailed { executable, args, exitCode, stdout, stderr, cause? }` → exit 1.
- `StateReadError { scope, path, cause }`, `StateInvariantError { violations }`, `StateCommitError { scope, phase, cause }`, `ConcurrentMutationError { scope }` → exit 1.
- `MaterializationError { skillId?, phase, path?, cause }`, `ArchiveError { operation, path, cause }`, `SelfUpdateError { phase, cause }` → exit 1.
- `ProjectionError { agent?, failures }` is returned as a degraded post-commit result, recommended exit 3, because canonical state may already be committed.

Unexpected defects render diagnostics to stderr and exit 1. Interruption closes scopes and exits 130; if the Generation was already published, output must say so and direct the user to retry `gitgud sync`. JSON mode emits exactly one document and never mixes progress text into stdout.

## 4. Authoritative state and publication

### Classification

- **Authoritative desired/resolved state:** one validated pair `{ Profile v2, Resolution Lock v2 }` in the current Generation. Profile is intent; lock is its immutable resolution. Legacy v1 exists only as migration input.
- **Derived immutable cache:** discovered skill directories stored by content hash and linked from locked `{source, commit, subpath}` resolutions. Repository content outside skill directories is temporary and not retained.
- **Derived canonical managed store:** complete staged materialization of enabled, present, hash-verified locked skills for that generation.
- **Managed sources:** GitHub, local-path, and registry-resolved skills all enter the Profile and Resolution Lock; gitgud has no unmanaged installation lifecycle.
- **Agent directories:** best-effort projections with positive gitgud ownership markers/links; never authoritative. User-owned agent entries remain outside gitgud ownership.

### Recommended publication model

Under each scope root:

```text
state/current.json                 # atomic pointer: generation id + schema
state/generations/<id>/profile.json
state/generations/<id>/gitgud.lock.json
state/generations/<id>/skills/     # complete managed store
cache/skills/<content-hash>/        # immutable filtered skill snapshot
state/staging/<operation-id>/      # never published
state/write.lock                   # mutation serialization
```

`profile.json`, `gitgud.lock.json`, and `skills` at legacy paths are compatibility views during migration, not independently writable truth. The exact compatibility mechanism must be tested on all supported filesystems; if symlinked files/dirs are unacceptable, readers move first and legacy paths become export snapshots.

### Invariants and enforcement

| Invariant | Owning enforcement boundary |
|---|---|
| A current Generation references one parseable v2 Profile/Resolution Lock pair; v1 is accepted only by the one-time migration reader. | `StateStore.read` and `StateStore.commit` before pointer publication. |
| Profile source IDs are unique; every lock source key/id corresponds to exactly one profile source with matching repo/ref/subdir. | Pure `validateStatePair`; called on import, read, and commit. |
| Every selection refers to a locked skill under its declared `sourceId`. An enabled pinned skill continues to materialize from its immutable resolution when source refresh marks it `removed-upstream`; only explicit user intent changes it. | `validateStatePair` plus pure materialization planner. |
| Enabled skill names are unique. | Materialization planner before any staging write. |
| A cache key identifies one immutable filtered skill directory by content hash; existing entries are never deleted/replaced while referenced. | `GithubSnapshots` publish; collision is verified or rejected. |
| Every locked pin identifies a source commit/subpath and an available cached skill snapshot whose filtered bytes hash to `contentHash`. | Generation preflight/staging builder. |
| A failed/interrupted mutation leaves the prior `current.json` and generation intact. | `StateStore.withMutationLock` + scoped staging + atomic pointer rename. |
| Only one scope mutation publishes at a time. | Process lock acquired before authoritative read and held through commit. |
| Retry after abandoned staging is safe; startup removes unreferenced staging and never guesses a new current generation. | `StateStore` recovery. |
| Every gitgud-managed skill has tracked ownership. Reconciliation never deletes a path without a matching tracked owner and explicit removal intent; user-owned projection entries are preserved. | State validation, materialization planner, projection planner. |
| Agent projection success is not implied by canonical commit success. | Command outcome includes `projection: succeeded | degraded | skipped`; renderer/exit policy. |
| Non-TTY add/install has explicit selection intent; absence is `UsageError`, not “track all disabled.” | CLI input validation before mutation. |

### Mutation protocol

For `add`, `select`, `apply`, `update`, and profile apply:

1. Acquire scope write lock; recover abandoned staging.
2. Read and validate the current generation.
3. Compute intended profile changes with pure functions.
4. Resolve refs and download repositories into scoped temporary staging. A ref-resolution error fails; no implicit fallback.
5. Discover skills, apply built-in exclusions plus `.gitgudignore`, hash their filtered trees, persist missing content-addressed snapshots, and compute the next lock with `applyDiscoveryToLock`-style pure reconciliation.
6. Validate profile/lock pair and preflight every enabled skill.
7. Build the complete next managed store in a new generation directory; validate manifests, names, and hashes there.
8. Durably rename the generation into place, then atomically replace `current.json`. This is the only commit point.
9. Release the mutation lock.
10. Reconcile agent projections. Surface degradation; do not roll back an already published canonical generation.

Self-update and archive export/import use their own staged replace protocols but do not participate in the profile/lock generation unless import is explicitly defined as a tracked-state transition.

## 5. Production and test call graphs

### Production

```text
src/cli.ts
  BunRuntime.runMain(program(argv).provide(AppLive))
    parseCli (plain)
    dispatch (Effect)
      command use case (Effect)
        pure domain transforms/planners
        StateStore / GithubSnapshots / ProjectionStore
          FileSystem / Path / HttpClient / ChildProcessSpawner / RuntimeContext
    renderResult | renderError (plain)
    Terminal write + ExitStatus set (Effect)
```

### Test

```text
bun test
  program(invocation)
    provide TestRuntimeContext
    provide InMemory/FaultingStateStore
    provide StubGithubSnapshots
    provide RecordingProjectionStore
    runPromiseExit once in the test harness
  assert Exit tag + state generation + recorded output/events
```

`runPromise`/`runPromiseExit` is allowed only in tests or a foreign embedding boundary after all requirements are provided. No test invokes a runner from inside a service.

## 6. Explicit anti-pattern rejection and adapters

Rejected:

```ts
Effect.runPromiseExit(Effect.tryPromise(() => existingAsyncCommand()))
```

Also rejected: an Effect service whose implementation is only `Effect.tryPromise(() => oldPromiseService())`, nested runners, broad `Effect.catch(() => Effect.succeed(...))`, and layers for pure modules. Those preserve the old failure/resource model and merely rename the call stack.

Unavoidable adapters are only at APIs not already represented by Effect platform services:

- callback/raw-mode terminal events for the interactive selector, via one `Effect.callback`/scoped adapter with listener and raw-mode finalizers, if `effect/Terminal` cannot express the interaction;
- a Bun/Node exit-status setter (`process.exitCode`) behind `ExitStatus`, because abrupt `process.exit` would bypass finalizers;
- any third-party API that only returns a Promise and has no Effect-native/platform equivalent. The adapter lives in its concrete layer, maps rejection once to a typed boundary error, and is not exposed as `Promise` upstream.

GitHub HTTP must use `HttpClient`; filesystem uses `FileSystem`; tar uses `ChildProcessSpawner`; temp resources use `acquireRelease`/scoped filesystem APIs. These are not Promise adapters. YAML/frontmatter parsing remains synchronous plain TypeScript.

## 7. Staged migration — vertical, red-capable

### Stage 0 — correctness baseline before Effect

- Add failing regression tests for same repo/SHA with two subdirs, migration of legacy direct installs into tracked state, preservation of user-owned projection entries, pinned continuity after upstream removal, tracked uninstall semantics, non-TTY add/install, profile/lock mismatch, projection failure visibility, and command exit/render behavior.
- Decide persistence/ownership semantics below; do not freeze the current destructive behavior as desired behavior.
- Pin a dedicated branch/lockfile to exact Effect beta versions and verify Bun compile targets.

Proof: existing 79 tests stay green; new tests are initially red for known defects and turn green only with their owning slice.

### Stage 1 — one read-only command and the outer shell

- Introduce `CommandResult`, tagged `AppError`, pure renderers, `RuntimeContext`, `ExitStatus`, and Bun composition.
- Rewrite `status` end-to-end as Effect-native file reads and command result; remove its local exit/rendering.
- During strangling, `src/cli.ts` chooses either the Effect entry or the untouched legacy entry before execution. Exactly one runner is used per invocation. No legacy Promise is wrapped in Effect.

Red tests: text/JSON success, usage exit 2, malformed profile/lock typed failure, operation/defect exit 1, interruption 130, and no direct process exit. Bun binary smoke tests verify exit status and final output.

### Stage 2 — GitHub refresh slice

- Rewrite resolve/download/tar/temp/discovery/cache in `sources/github.ts` and refresh orchestration in `core/source-manager.ts` as native Effects.
- Use the resolved commit only for source identity and temporary download; persist discovered skill directories by filtered content hash, with source commit/subpath recorded in the lock.
- Remove silent commit fallback and broad traversal-error suppression unless an explicit policy says otherwise.

Red tests: two subpaths at same SHA in both orders, root+subdir, resolve failure does not download mutable ref, HTTP/schema/tar errors retain tags, temp cleanup on failure/interruption, cache collision immutability.

### Stage 3 — transactional `add`/`update`/`apply`

- Add generation-based `StateStore`, mutation lock, cross-state validation, staged materialization, atomic publication, and recovery.
- Route add/update/apply through one mutation protocol; remove independent profile/lock writes and in-place materialization.

Red tests inject failure after each phase/write/rename; prior generation remains readable and retry converges. Add concurrent writer test, stale lock recovery policy test, hash mismatch test, duplicate name test, and removed-upstream pinned-continuity test.

### Stage 4 — selection/profile/uninstall ownership semantics

- Migrate selection and profile apply/export onto `StateStore`.
- Make uninstall an explicit tracked-state transition and keep source removal distinct from skill selection changes.
- Require explicit non-TTY selection flags.

Red tests: imported profile mismatch rejected before publication, offline-vs-refresh policy, tracked uninstall persists across apply, upstream removal preserves pinned content, local sources participate in the same tracked lifecycle, and non-TTY omission is exit 2.

### Stage 5 — projection/sync

- Extract a plain sync planner and an Effect-native executor using filesystem services.
- Replace `autoSync` with returned `ProjectionOutcome`; preserve user-owned agent entries and force/prune rules.

Red tests: partial agent failure, managed/user-owned symlink edges, interruption, retry/idempotency, JSON degraded result, and exit 3.

### Stage 6 — archive, local sources, and registry

- Migrate complete portable archive workflows, registry HTTP, and tracked local-source snapshots one command at a time.
- Apply `.gitgudignore`, reject escaping symlinks, and exclude `.git` and `node_modules` consistently in discovery, hashing, snapshots, materialization, and archives.

Red tests: traversal/name/symlink checks retained, every pin is archived, forced export never destroys the old archive before replacement succeeds, import publishes one complete Generation, local-source absence fails before mutation, and tar stderr/exit are retained. Self-update remains outside this migration.

### Stage 7 — remove legacy entry

- Once every command is Effect-native, delete the legacy dispatcher and Promise/try-catch orchestration.
- Repository checks: `rg 'process\.(exit|stdout|stderr)|Effect\.runPromise|Effect\.runPromiseExit|Effect\.tryPromise|new Promise' src` has only reviewed composition/foreign-adapter hits.

## 8. Effect v4 incompatibilities and uncertainties

- Effect v4 is beta; npm stable remains v3. Exact `4.0.0-beta.98` packages must be pinned together. Beta upgrades are explicit migration work.
- `effect/unstable/cli`, `effect/unstable/process`, and `effect/unstable/http` may change even after core v4 stability. Isolate HTTP/process imports in adapters. Keep the existing pure `node:util.parseArgs` parser initially to avoid taking unnecessary CLI instability.
- v4 uses `Context.Service` + explicit `Layer.effect`; old `Context.Tag`/`Effect.Service`/`.Default` examples are stale.
- `Either` is `Result`; yieldables are no longer Effect subtypes. Combinator names changed (`catchAll→catch`, `zipRight→andThen`, `zipLeft→tap`), and `Runtime<R>` is gone.
- Verify `BunRuntime.runMain` signal handling, `process.exitCode` interaction, terminal raw mode restoration, symlink/rename semantics, and compiled binaries on all four build targets before deleting the legacy entry.
- Confirm whether Bun’s shared Node filesystem implementation provides the durability operations required by the generation protocol. Atomic rename is available; fsync/directory-fsync guarantees may require a narrow platform adapter and documented crash model.
- The target intentionally does not make synchronous code Effect-native for uniformity. Some current synchronous filesystem modules will be split: planning stays plain, execution moves to `FileSystem` effects.

## 9. Settled constraints

- Adopt Effect v4 beta with exact matching pins; isolate unstable HTTP/process imports and keep the existing pure argument parser initially.
- Interpret Effect and write final process output only in `src/cli.ts`; commands return data or typed failures. Pure leaf operations remain plain TypeScript, and Layers model only external boundaries.
- Publish Profile, Resolution Lock, and managed skills as one atomic Generation. Fail immediately when a Scope writer is active; target interruption safety now and defer fsync-grade power-loss guarantees.
- Track and pin every GitHub, local, and registry-resolved skill. Local content changes only on explicit update. Upstream removal preserves the last pin; explicit source update advances present pins and keeps removed pins.
- Cache filtered skill snapshots by content hash, not repositories. Exclude `.git`, `node_modules`, and `.gitgudignore` matches; allow only symlinks contained by the skill root.
- Uninstall disables a Selection and retains its pin. Source removal is confirmed destructive intent that removes all owned pins. Cache deletion occurs only through explicit garbage collection; retain current and previous Generations.
- Profile apply reproduces the lock without refresh. Manifest-only Profiles require local paths to exist; complete archives carry Profile, Resolution Lock, and every pinned skill.
- Project Scope overlays global Scope. Local same-name intent wins; conflicts inside one Scope fail.
- Auto-sync after publication. Projection failure produces a Degraded Commit and exit 3; interruption always exits 130 even after commit. Exit codes are 0, 1, 2, 3, and 130.
- Non-TTY multi-skill operations require `--all`, `--enable`, or `--track-only`. Every mutation supports dry-run.
- Support private GitHub sources through existing credentials without persisting secrets. Ref-resolution failure is fatal and leaves pins unchanged. Explicit source update itself is approval; no extra confirmation.
- Make a clean CLI break with `source`, `skill`, `profile`, and `cache` groups. Migrate in vertical slices, beginning with the runtime shell and read-only `status`; write failing regression tests before each owning slice.
- Self-update is outside this migration.
