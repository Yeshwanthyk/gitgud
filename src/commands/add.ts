import { materialize } from "../core/materialize";
import { setSelections, writeProfile } from "../core/profile";
import { runSelector } from "../core/selector";
import { addGithubSourceToProfile } from "../core/source-manager";
import { formatError } from "../output";
import type { OutputFormat, Scope } from "../types";
import { buildSelectableSkills } from "./select";
import { autoSync } from "./sync";

type AddOptions = {
	scope: Scope;
	format: OutputFormat;
};

function fail(message: string, format: OutputFormat): never {
	process.stderr.write(`${formatError(message, format)}\n`);
	process.exit(1);
}

function summarizeChanges(entries: { change: string }[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const entry of entries) counts[entry.change] = (counts[entry.change] ?? 0) + 1;
	return counts;
}

export async function addCommand(args: string[], options: AddOptions): Promise<void> {
	const sourceInput = args[0];
	if (!sourceInput) fail("Missing GitHub source.", options.format);

	try {
		const { profile, source, refresh } = await addGithubSourceToProfile(options.scope, sourceInput);
		const items = await buildSelectableSkills(options.scope, source.id);
		const updates = await runSelector(source.id, items);

		if (!updates) {
			if (options.format === "json") {
				process.stdout.write(
					`${JSON.stringify(
						{
							ok: true,
							source,
							selected: false,
							changes: summarizeChanges(refresh.entries),
							message: "Tracked source with all new skills disabled.",
						},
						null,
						2
					)}\n`
				);
				return;
			}
			process.stdout.write(
				`Tracked ${source.id} with ${refresh.entries.length} skill(s). Run gitgud select ${source.id} to enable skills.\n`
			);
			return;
		}

		await writeProfile(options.scope, setSelections(profile, updates));
		const materialized = await materialize(options.scope);
		if (options.scope === "global") autoSync();

		if (options.format === "json") {
			process.stdout.write(
				`${JSON.stringify(
					{
						ok: true,
						source,
						selected: true,
						changes: summarizeChanges(refresh.entries),
						materialized,
					},
					null,
					2
				)}\n`
			);
			return;
		}

		process.stdout.write(
			`Tracked ${source.id} and applied ${Object.keys(updates).length} selection(s).\n`
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown add error";
		fail(message, options.format);
	}
}
