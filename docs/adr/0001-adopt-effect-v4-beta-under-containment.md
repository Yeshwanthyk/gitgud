# Adopt Effect v4 beta under strict containment

We will migrate gitgud to Effect v4 despite its beta status because the target architecture benefits from Effect-native workflows and the version choice is intentional. `effect` and `@effect/platform-bun` will be pinned to the exact same beta version; unstable HTTP and process APIs will remain behind local adapters, the existing pure CLI parser will remain initially, upgrades will be explicit work, and `BunRuntime.runMain` in the executable composition root will be the sole production interpreter.
