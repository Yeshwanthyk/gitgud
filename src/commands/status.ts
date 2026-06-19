import { ANSI, paint } from "../core/colors";
import { readLockfile } from "../core/lockfile";
import { readProfile } from "../core/profile";
import { formatError } from "../output";
import type { OutputFormat, Scope } from "../types";

type StatusOptions = {
	scope: Scope;
	format: OutputFormat;
};

function fail(message: string, format: OutputFormat): never {
	process.stderr.write(`${formatError(message, format)}\n`);
	process.exit(1);
}

export async function statusCommand(_args: string[], options: StatusOptions): Promise<void> {
	try {
		const profile = await readProfile(options.scope);
		const lockfile = await readLockfile(options.scope);
		const rows = [];

		for (const source of Object.values(lockfile.sources)) {
			for (const skill of Object.values(source.skills)) {
				rows.push({
					source: source.id,
					name: skill.name,
					subpath: skill.subpath,
					upstream: skill.status,
					selection: profile.selections[skill.id] ?? "disabled",
					contentHash: skill.contentHash,
				});
			}
		}

		rows.sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name));

		if (options.format === "json") {
			process.stdout.write(
				`${JSON.stringify({ ok: true, sources: profile.sources, skills: rows }, null, 2)}\n`
			);
			return;
		}

		if (rows.length === 0) {
			process.stdout.write("No tracked skills.\n");
			return;
		}

		let currentSource = "";
		for (const row of rows) {
			if (row.source !== currentSource) {
				currentSource = row.source;
				process.stdout.write(`\n${paint(ANSI.bold, currentSource)}\n`);
			}
			const selection = row.selection === "enabled" ? paint(ANSI.green, "enabled ") : "disabled";
			const upstream =
				row.upstream === "removed-upstream" ? ` ${paint(ANSI.red, "removed upstream")}` : "";
			process.stdout.write(`  ${selection}  ${row.name}${upstream}\n`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown status error";
		fail(message, options.format);
	}
}
