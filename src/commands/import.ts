import { getSkillsStoreDir, importSkillsArchive } from "../core/skill-archive";
import { formatError } from "../output";
import type { OutputFormat, Scope } from "../types";
import { autoSync } from "./sync";

type ImportOptions = {
	scope: Scope;
	format: OutputFormat;
	force: boolean;
	dryRun: boolean;
};

function fail(message: string, format: OutputFormat): never {
	process.stderr.write(`${formatError(message, format)}\n`);
	process.exit(1);
}

function changedCount(actions: { action: string }[]): number {
	return actions.filter((action) => action.action === "imported" || action.action === "replaced")
		.length;
}

export async function importCommand(args: string[], options: ImportOptions): Promise<void> {
	const archivePath = args[0];
	if (!archivePath) fail("Missing import archive path.", options.format);

	try {
		const targetDir = getSkillsStoreDir(options.scope);
		const result = await importSkillsArchive({
			archivePath,
			targetDir,
			force: options.force,
			dryRun: options.dryRun,
		});

		if (options.scope === "global" && !options.dryRun && changedCount(result.actions) > 0) {
			autoSync();
		}

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

		const counts = result.actions.reduce<Record<string, number>>((acc, action) => {
			acc[action.action] = (acc[action.action] ?? 0) + 1;
			return acc;
		}, {});
		const summary = Object.entries(counts)
			.map(([action, count]) => `${count} ${action}`)
			.join(", ");
		process.stdout.write(
			`Processed ${result.actions.length} skills for ${options.scope} registry${summary ? ` (${summary})` : ""}.\n`
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown import error";
		fail(message, options.format);
	}
}
