import type { LockedSkill } from "../core/lockfile";
import { readLockfile } from "../core/lockfile";
import { materialize } from "../core/materialize";
import { readProfile, setSelections, writeProfile } from "../core/profile";
import { runSelector, type SelectableSkill } from "../core/selector";
import { formatError } from "../output";
import type { OutputFormat, Scope } from "../types";
import { autoSync } from "./sync";

type SelectOptions = {
	scope: Scope;
	format: OutputFormat;
};

function fail(message: string, format: OutputFormat): never {
	process.stderr.write(`${formatError(message, format)}\n`);
	process.exit(1);
}

function groupFor(skill: LockedSkill): string {
	if (skill.subpath === ".") return "root";
	const parts = skill.subpath.split("/");
	return parts.length > 1 ? parts.slice(0, -1).join("/") : "root";
}

export async function buildSelectableSkills(
	scope: Scope,
	sourceFilter?: string
): Promise<SelectableSkill[]> {
	const profile = await readProfile(scope);
	const lockfile = await readLockfile(scope);
	const items: SelectableSkill[] = [];

	for (const source of Object.values(lockfile.sources)) {
		if (sourceFilter && source.id !== sourceFilter && source.repo !== sourceFilter) continue;
		for (const skill of Object.values(source.skills)) {
			items.push({
				id: skill.id,
				name: skill.name,
				description: skill.description,
				group: groupFor(skill),
				state: profile.selections[skill.id] ?? "disabled",
				status: skill.status,
			});
		}
	}

	return items.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}

export async function selectCommand(args: string[], options: SelectOptions): Promise<void> {
	try {
		const sourceFilter = args[0];
		const items = await buildSelectableSkills(options.scope, sourceFilter);
		if (items.length === 0) {
			fail(
				sourceFilter ? `No skills found for ${sourceFilter}.` : "No tracked skills.",
				options.format
			);
		}

		const updates = await runSelector(sourceFilter ?? "gitgud skills", items);
		if (!updates) {
			if (options.format === "json") {
				process.stdout.write(`${JSON.stringify({ ok: false, cancelled: true }, null, 2)}\n`);
			} else {
				process.stdout.write("Selection cancelled.\n");
			}
			return;
		}

		const profile = setSelections(await readProfile(options.scope), updates);
		await writeProfile(options.scope, profile);
		const materialized = await materialize(options.scope);
		if (options.scope === "global") autoSync();

		if (options.format === "json") {
			process.stdout.write(
				`${JSON.stringify({ ok: true, updated: Object.keys(updates).length, materialized }, null, 2)}\n`
			);
			return;
		}

		process.stdout.write(`Updated ${Object.keys(updates).length} selection(s).\n`);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown select error";
		fail(message, options.format);
	}
}
