import type { OutputFormat } from "../types";
import { resolveSkill } from "../core/skills";
import { formatError } from "../output";

export type PathCommandOptions = {
  name?: string;
  format: OutputFormat;
};

export async function runPathCommand(
  args: string[],
  options: PathCommandOptions,
): Promise<void> {
  const name = options.name ?? args[0];
  if (!name) {
    process.stderr.write(
      `${formatError("Missing skill name.", options.format)}\n`,
    );
    process.exit(1);
  }

  const resolved = resolveSkill(name);
  if (!resolved.ok) {
    process.stderr.write(
      `${formatError(resolved.error.message, options.format)}\n`,
    );
    process.exit(1);
  }

  process.stdout.write(`${resolved.value.path}\n`);
}
