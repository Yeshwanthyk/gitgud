import path from "node:path";
import { existsSync, rmSync, statSync } from "node:fs";

import type { OutputFormat } from "../types";
import { getGlobalSkillsDir, getLocalSkillsDir } from "../core/paths";
import { formatError } from "../output";

export type UninstallOptions = {
  name?: string;
  local: boolean;
  format: OutputFormat;
};

export function uninstallCommand(
  args: string[],
  options: UninstallOptions,
): void {
  const name = options.name ?? args[0];
  if (!name) {
    process.stderr.write(
      `${formatError("Missing skill name.", options.format)}\n`,
    );
    process.exit(1);
  }

  const skillsDir = options.local
    ? getLocalSkillsDir()
    : getGlobalSkillsDir();

  if (!skillsDir) {
    process.stderr.write(
      `${formatError("Local skills directory not found.", options.format)}\n`,
    );
    process.exit(1);
  }

  const targetPath = path.join(skillsDir, name);
  if (!existsSync(targetPath)) {
    process.stderr.write(
      `${formatError(`Skill not found: ${name}`, options.format)}\n`,
    );
    process.exit(1);
  }

  try {
    const stats = statSync(targetPath);
    if (!stats.isDirectory()) {
      process.stderr.write(
        `${formatError(
          `Skill path is not a directory: ${targetPath}`,
          options.format,
        )}\n`,
      );
      process.exit(1);
    }

    rmSync(targetPath, { recursive: true, force: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown remove error";
    process.stderr.write(
      `${formatError(`Failed to uninstall skill: ${message}`, options.format)}\n`,
    );
    process.exit(1);
  }

  if (options.format === "json") {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          name,
          scope: options.local ? "local" : "global",
          path: targetPath,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  process.stdout.write(
    `Uninstalled skill "${name}" from ${options.local ? "local" : "global"} registry.\n`,
  );
}
