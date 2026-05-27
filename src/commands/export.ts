import { exportSkillsArchive } from "../core/skill-archive";
import { formatError } from "../output";
import type { OutputFormat, Scope } from "../types";

type ExportOptions = {
	scope: Scope;
	format: OutputFormat;
	force: boolean;
};

function fail(message: string, format: OutputFormat): never {
	process.stderr.write(`${formatError(message, format)}\n`);
	process.exit(1);
}

export async function exportCommand(args: string[], options: ExportOptions): Promise<void> {
	const archivePath = args[0];
	if (!archivePath) fail("Missing export archive path.", options.format);

	try {
		const result = await exportSkillsArchive({
			scope: options.scope,
			archivePath,
			force: options.force,
		});

		if (options.format === "json") {
			process.stdout.write(
				`${JSON.stringify(
					{
						ok: true,
						scope: options.scope,
						...result,
					},
					null,
					2
				)}\n`
			);
			return;
		}

		process.stdout.write(
			`Exported ${result.skills.length} skills from ${options.scope} registry to ${result.archivePath}.\n`
		);
		if (result.skipped.length > 0) {
			process.stdout.write(`Skipped ${result.skipped.length} invalid entries:\n`);
			for (const skipped of result.skipped) {
				process.stdout.write(`  - ${skipped.name}: ${skipped.reason}\n`);
			}
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown export error";
		fail(message, options.format);
	}
}
