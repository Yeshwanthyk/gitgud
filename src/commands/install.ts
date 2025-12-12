import path from "node:path";

import type { OutputFormat } from "../types";
import { getGlobalSkillsDir, getLocalSkillsDir } from "../core/paths";
import { formatError } from "../output";
import { parseSource } from "../sources/parse";
import { installFromLocal } from "../sources/local";
import { installFromGithub } from "../sources/github";
import { installFromRegistry } from "../sources/registry";

export type InstallOptions = {
  source?: string;
  local: boolean;
  format: OutputFormat;
};

export async function installCommand(
  args: string[],
  options: InstallOptions,
): Promise<void> {
  const sourceInput = options.source ?? args[0];
  if (!sourceInput) {
    process.stderr.write(
      `${formatError("Missing install source.", options.format)}\n`,
    );
    process.exit(1);
  }

  const targetDir = options.local
    ? getLocalSkillsDir()
    : getGlobalSkillsDir();

  if (!targetDir) {
    process.stderr.write(
      `${formatError("Local skills directory not found.", options.format)}\n`,
    );
    process.exit(1);
  }

  let parsed;
  try {
    parsed = parseSource(sourceInput);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown source parse error";
    process.stderr.write(
      `${formatError(message, options.format)}\n`,
    );
    process.exit(1);
  }

  try {
    if (parsed.type === "local") {
      const res = installFromLocal({
        sourcePath: parsed.path,
        targetDir,
      });
      if (!res.ok) {
        process.stderr.write(
          `${formatError(res.error.message, options.format)}\n`,
        );
        process.exit(1);
      }

      if (options.format === "json") {
        process.stdout.write(
          `${JSON.stringify(
            {
              ok: true,
              name: res.value,
              scope: options.local ? "local" : "global",
              targetDir,
              source: sourceInput,
              sourceType: parsed.type,
            },
            null,
            2,
          )}\n`,
        );
        return;
      }

      process.stdout.write(
        `Installed skill "${res.value}" into ${options.local ? "local" : "global"} registry.\n`,
      );
      return;
    }

    if (parsed.type === "github") {
      const url = `github:${parsed.repo}${parsed.subdir ? `/${parsed.subdir}` : ""}${parsed.ref ? `#${parsed.ref}` : ""}`;
      const res = await installFromGithub({
        url,
        targetDir,
      });
      if (!res.ok) {
        process.stderr.write(
          `${formatError(res.error.message, options.format)}\n`,
        );
        process.exit(1);
      }

      const installedPath = res.value;
      const name = path.basename(installedPath);

      if (options.format === "json") {
        process.stdout.write(
          `${JSON.stringify(
            {
              ok: true,
              name,
              path: installedPath,
              scope: options.local ? "local" : "global",
              targetDir,
              source: sourceInput,
              sourceType: parsed.type,
            },
            null,
            2,
          )}\n`,
        );
        return;
      }

      process.stdout.write(
        `Installed skill "${name}" from GitHub into ${options.local ? "local" : "global"} registry.\n`,
      );
      return;
    }

    if (parsed.type === "registry") {
      const identifier = parsed.version
        ? `${parsed.package}@${parsed.version}`
        : parsed.package;
      const res = await installFromRegistry({
        identifier,
        targetDir,
      });
      if (!res.ok) {
        process.stderr.write(
          `${formatError(res.error.message, options.format)}\n`,
        );
        process.exit(1);
      }

      const installedPath = res.value;
      const name = path.basename(installedPath);

      if (options.format === "json") {
        process.stdout.write(
          `${JSON.stringify(
            {
              ok: true,
              name,
              path: installedPath,
              scope: options.local ? "local" : "global",
              targetDir,
              source: sourceInput,
              sourceType: parsed.type,
            },
            null,
            2,
          )}\n`,
        );
        return;
      }

      process.stdout.write(
        `Installed skill "${name}" from registry into ${options.local ? "local" : "global"} registry.\n`,
      );
      return;
    }

    process.stderr.write(
      `${formatError(`Unsupported source type: ${(parsed as any).type}`, options.format)}\n`,
    );
    process.exit(1);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown install error";
    process.stderr.write(
      `${formatError(message, options.format)}\n`,
    );
    process.exit(1);
  }
}
