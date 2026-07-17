# Effect v4 invariants

These invariants are settled. They define correctness for the migration; implementation details may change only if these guarantees remain true.

## State ownership

1. A **Profile** is user intent: Skill Sources and enabled or disabled Selections.
2. A **Resolution Lock** is the exact immutable resolution of that Profile.
3. A **Generation** contains one valid Profile, its matching Resolution Lock, and the managed skill files produced from them.
4. The current Generation is authoritative. Cache entries and agent directories are derived.
5. Every skill managed by gitgud is tracked and pinned. There is no unmanaged gitgud install lifecycle.
6. Every Selection points to one Pinned Skill owned by a Skill Source in the same effective Profile.
7. Project-local intent overlays global intent. A local same-name Selection wins; duplicate enabled names inside one Scope fail.

## Publication and recovery

1. Readers see either the complete previous Generation or the complete next Generation, never a partial mix.
2. A mutation stages and validates all state before changing the current-generation pointer.
3. The current-generation pointer is the only commit point.
4. Failure or interruption before the commit point leaves the previous Generation current.
5. Interruption after the commit point keeps the new Generation and reports that Projection may need retry.
6. Each Scope has one writer. A second mutating process fails immediately while the Scope is busy.
7. Startup recovery may remove abandoned staging, but never guesses or publishes an incomplete Generation.
8. The first migration builds and validates Generation 1 while preserving a backup of legacy state.
9. The current and immediately previous Generations are protected from garbage collection.
10. The first release guarantees atomic visibility, serialized writes, and interruption safety. Fsync-grade power-loss durability is not promised yet.

## Pins and source lifecycle

1. GitHub pins identify an exact commit, source subpath, and filtered skill content hash.
2. Local source content changes only when the user explicitly updates that source.
3. Explicit GitHub update advances tracked skills still present at the new commit.
4. New upstream skills are discovered disabled.
5. If an upstream skill disappears, its existing pin remains available and continues to materialize while enabled.
6. Failure to resolve a GitHub ref to an immutable commit is fatal and leaves all current pins unchanged.
7. `skill disable`—the new meaning of uninstall—removes Projection intent but retains the source and pin.
8. Removing a Skill Source is explicit destructive intent and removes all Selections and pins owned by that source.
9. Applying a Profile reproduces its Resolution Lock and never refreshes sources implicitly.
10. An explicit source update is itself approval to advance present pins; no second confirmation is required.

## Snapshots, cache, and archives

1. Repository downloads are temporary discovery inputs, not permanent cache entries.
2. Permanent cache entries contain only filtered skill directories and are keyed by content hash.
3. A lock records source identity, GitHub commit when applicable, source subpath, and content hash.
4. Cache entries are immutable while referenced by any retained Generation or pin.
5. `.git` and `node_modules` are always excluded.
6. `.gitgudignore` supplies additional source-relative exclusions; ordinary `.gitignore` is not applied automatically.
7. Symbolic links are accepted only when their resolved target remains inside the owning skill directory.
8. File content, executable permissions, relative paths, and safe symlink targets required by a skill survive snapshot, materialization, and archive round trips.
9. Cache deletion happens only through explicit `cache gc` and only for content unreferenced by retained Generations or active pins.
10. A complete archive contains the Profile, Resolution Lock, and filtered files for every pin, including disabled and removed-upstream pins. It does not contain the general cache.
11. A manifest-only Profile containing a missing local source fails before publication; portable recovery uses a complete archive.

## Projection

1. Agent directories are Projections, never authoritative state.
2. Sync changes only entries that gitgud positively owns, unless the user explicitly forces a conflict replacement.
3. User-owned agent entries are preserved by default.
4. Every successful Generation publication immediately attempts Projection.
5. Full Projection returns exit `0`.
6. Projection failure after commit keeps the Generation and returns a Degraded Commit with exit `3`.
7. `gitgud sync` is a convergent retry: repeated successful runs reach the same Projection without changing authoritative state.
8. Interruption always exits `130`; if commit already happened, output says so and directs the user to run `gitgud sync`.

## Effect boundary

1. `src/cli.ts` owns the only production Effect interpreter.
2. No command, service, or adapter calls `Effect.runPromise`, `Effect.runPromiseExit`, `BunRuntime.runMain`, or `process.exit`.
3. Commands return semantic data or typed failures. Final stdout, stderr, and exit status are produced at the CLI boundary.
4. Progress and interactive output go through an injected terminal/output boundary.
5. Effect is used throughout command and state workflows, but deterministic leaf functions remain ordinary TypeScript.
6. Layers represent replaceable external boundaries only: state/filesystem, GitHub, child processes, terminal/runtime context, and Projection.
7. Promise or callback adaptation is allowed only inside a concrete foreign-API adapter when no Effect-native platform service exists.
8. `effect` and `@effect/platform-bun` are pinned to exactly matching v4 beta versions.
9. Unstable HTTP and process imports stay behind local adapters. The existing pure CLI parser remains initially.
10. Self-update is outside this migration.

## Errors and command behavior

1. Expected failures remain typed until the CLI renderer; causes are not flattened early to strings.
2. Exit codes are stable: `0` success, `1` operation failure, `2` usage error, `3` Degraded Commit, `130` interruption.
3. JSON mode emits exactly one JSON document and no progress text on stdout.
4. Text and JSON render the same semantic result.
5. A dry run performs parsing, validation, discovery where needed, and planning, but publishes no Generation and changes no Projection.
6. Every mutating command supports dry run.
7. Non-TTY multi-skill add/install requires explicit `--all`, `--enable`, or `--track-only`; missing intent is exit `2` with no mutation.
8. Private GitHub credentials are runtime inputs and never enter Profile, Resolution Lock, cache metadata, logs, or output.
9. Authentication, rate-limit, validation, process, filesystem, lock, and Projection failures are distinguishable typed failures.

## Public command model

1. The migration makes a clean breaking CLI change; conflicting legacy aliases are not retained.
2. Management commands are grouped under `source`, `skill`, `profile`, and `cache`.
3. `update` means moving managed source pins. `self-update` means updating the gitgud binary.
4. `list`, `show`, `sync`, and `self-update` remain common top-level commands.
5. README, help, JSON shapes, tests, and changelog ship with the new contract.
