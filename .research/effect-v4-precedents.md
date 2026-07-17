# Effect v4 migration precedents for gitgud

Research snapshot: Effect `bddb010eac3d4436cb094edbbee7460c5440c162` (main; v4 beta).

## Strong precedents

1. **One effectful core, one runtime boundary.** Effect's own `ai-codegen` exports `run` after composing command parsing and application services; its tiny executable only provides platform services and calls `NodeRuntime.runMain` ([main.ts#L196-L237](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/tools/ai-codegen/src/main.ts#L196-L237), [bin.ts#L1-L10](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/tools/ai-codegen/src/bin.ts#L1-L10)).
   - **Transfer:** `src/cli.ts` should become the only `BunRuntime.runMain` boundary. Export the command/program from a testable module; no `Effect.run*`, `await`, or `process.exit` below it.

2. **Model command input at the boundary; handlers depend on services.** The same tool declares flags/subcommands with `Command.make` and its handlers acquire services via `yield*` ([main.ts#L128-L155](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/tools/ai-codegen/src/main.ts#L128-L155)). The official comprehensive fixture demonstrates required/optional/variadic path arguments, aliases, and nested commands ([ComprehensiveCli.ts#L104-L236](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/effect/test/unstable/cli/fixtures/ComprehensiveCli.ts#L104-L236)).
   - **Transfer:** express gitgud's existing command grammar as a root command with subcommands. Keep `--local/--global`, formats, sources, and destructive flags in the typed command declaration; pass a narrow parsed input object to use-case functions.

3. **Use `Context.Service` + `Layer.effect` only around replaceable external boundaries.** `ProviderDiscovery` defines an interface/tag, declares concrete requirements in its layer type, acquires `FileSystem`/`Path`/Glob in an `Effect.gen`, and returns plain service operations ([Discovery.ts#L48-L69](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/tools/ai-codegen/src/Discovery.ts#L48-L69), [#L121-L190](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/tools/ai-codegen/src/Discovery.ts#L121-L190)).
   - **Transfer:** service boundaries worth introducing: GitHub fetch/clone, filesystem/materialization, archive process execution, possibly terminal/output. Do **not** create tags/layers for pure transforms such as frontmatter validation, manifest conversion, source parsing, or output rendering.

4. **Use platform-neutral `effect/FileSystem` and `effect/Path`; bind Bun once.** `FileSystem` is the portable service and reports typed `PlatformError` ([FileSystem.ts#L1-L18](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/effect/src/FileSystem.ts#L1-L18), [#L70-L160](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/effect/src/FileSystem.ts#L70-L160)). `BunServices.layer` bundles FS, Path, terminal/stdio and child-process spawner ([BunServices.ts#L1-L43](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/platform-bun/src/BunServices.ts#L1-L43)).
   - **Transfer:** replace `node:fs/promises` calls at effectful boundaries with `FileSystem`; leave zero-I/O path string helpers alone until they need `Path`. Install `BunServices.layer` only in CLI composition.

5. **Translate low-level failures into domain errors at the operation boundary.** Discovery uses `Data.TaggedError`, maps filesystem, parsing and schema errors to an actionable error while preserving the cause ([Discovery.ts#L88-L113](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/tools/ai-codegen/src/Discovery.ts#L88-L113), [#L130-L168](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/tools/ai-codegen/src/Discovery.ts#L130-L168)). Platform failures themselves retain normalized reason categories such as `NotFound` and `PermissionDenied` ([PlatformError.ts#L51-L151](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/effect/src/PlatformError.ts#L51-L151)).
   - **Transfer:** retain `PlatformError` internally where the CLI can sensibly distinguish it; wrap it at user-visible use-case boundaries in errors such as `RegistryNotFound`, `InvalidSkillSource`, `SourceFetchFailed`, `Conflict`, and `ArchiveFailed`. Include path/source/action and original cause. Avoid `Effect.catchAll(() => ...)` that discards classification.

6. **Scope process handles and capture both outputs before classifying exit failure.** Official code constructs commands as argv (not shell strings), scopes spawned handles, drains stdout/stderr concurrently, awaits exit code, and raises a structured error carrying command/path/exit/output ([PostProcess.ts#L90-L146](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/tools/ai-codegen/src/PostProcess.ts#L90-L146)).
   - **Transfer:** rewrite git/gh/tar execution through `unstable/process` child-process services with explicit executable + argument array. Scope every handle, retain stdout/stderr in `CommandFailed`, and never interpolate an untrusted source/path into a shell command.

7. **Use scope-owned temporary artifacts and assert cleanup.** The platform FS test uses `Effect.scoped` with `makeTempDirectoryScoped`, then verifies the path is gone after scope closure ([NodeFileSystem.test.ts#L35-L48](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/platform-node-shared/test/NodeFileSystem.test.ts#L35-L48)).
   - **Transfer:** remote snapshots, downloaded archives, and extraction staging dirs should be created with scoped APIs. Persist only the final cache/registry move after validation; add failure/interruption cleanup tests.

## Testing shape

- Unit-test each use case with `Effect.provide` test layers for filesystem/process/GitHub services. Avoid a `Bun.file`/real `process` dependency in core tests.
- Keep a small Bun integration suite against temporary directories for symlinks, permissions, archive interoperability, and compiled binary behavior.
- Test typed branches, not only strings: missing registry, bad frontmatter/schema, duplicate skill, unmanaged entry without `--force`, child exit nonzero, and cleanup on interruption/failure.

## Explicit rejections

- Do not put `Bun.*`, `node:fs/promises`, `Bun.spawn`, `process.exit`, or `Effect.runPromise` throughout command handlers.
- Do not layer-wrap every module or turn pure parsing/rendering into `Effect` merely for uniformity.
- Do not spawn shell commands; use argv arrays and capture both output streams.
- Do not reduce all errors to `Error`/printed strings or swallow `PlatformError` reasons.
- Do not use unscoped temp paths for fetch/extract workflows.

## Bun-specific uncertainty / migration risk

- Effect v4 is explicitly beta; its CLI namespace is `effect/unstable/cli`, so do not treat its API as stable. Pin exact beta versions and isolate command declarations behind `src/cli/`.
- Bun FS is currently a shared Node filesystem implementation rather than a Bun-native one ([BunFileSystem.ts#L1-L20](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/platform-bun/src/BunFileSystem.ts#L1-L20)). Benchmark gitgud's snapshot/materialization paths before assuming performance parity with direct Bun APIs.
- `BunRuntime.runMain` delegates to the Node-compatible runner ([BunRuntime.ts#L38-L52](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/platform-bun/src/BunRuntime.ts#L38-L52)); verify signals, exit codes, and compiled Bun binary behavior in gitgud CI before replacing the current entrypoint.
- The official `ai-codegen` precedent still leaks `process.cwd()` inside a service ([Discovery.ts#L173-L179](https://github.com/Effect-TS/effect/blob/bddb010eac3d4436cb094edbbee7460c5440c162/packages/tools/ai-codegen/src/Discovery.ts#L173-L179)). For gitgud, inject working directory/scope resolution to keep local/global tests deterministic.
