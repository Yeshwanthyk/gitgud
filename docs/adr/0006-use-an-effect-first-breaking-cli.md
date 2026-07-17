# Use an Effect-first breaking CLI

The new CLI makes a clean break and groups management under `source`, `skill`, `profile`, and `cache`; common `list`, `show`, `sync`, and `self-update` remain top-level. `src/cli.ts` owns the only Effect interpreter and final output, Layers model only external boundaries, and pure leaf functions stay plain TypeScript. Every mutation supports dry run, non-TTY multi-skill actions require explicit intent, exit codes are 0/1/2/3/130, rollout uses tested vertical slices, and self-update implementation is outside this migration.
