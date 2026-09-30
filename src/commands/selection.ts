import { materialize } from "../core/materialize";
import { readProfile, setSelections, type SelectionState, writeProfile } from "../core/profile";
import type { SelectableSkill } from "../core/selector";
import { formatError } from "../output";
import type { OutputFormat, Scope } from "../types";
import { buildSelectableSkills } from "./select";
import { autoSync } from "./sync";

type SelectionOptions = {
	scope: Scope;
	format: OutputFormat;
};

function fail(message: string, format: OutputFormat): never {
	process.stderr.write(`${formatError(message, format)}\n`);
	process.exit(1);
}

export function resolveSkills(args: string[], items: SelectableSkill[]): SelectableSkill[] {
	const resolved = new Set<SelectableSkill>();
	for (const arg of args) {
		const exact = items.find((item) => item.id === arg);
		if (exact) {
			resolved.add(exact);
			continue;
		}
		const matches = items.filter((item) => item.name === arg);
		if (matches.length === 0) throw new Error(`Skill not found: ${arg}.`);
		if (matches.length > 1) {
			throw new Error(`Ambiguous skill name ${arg}: ${matches.map((item) => item.id).join(", ")}.`);
		}
		for (const match of matches) resolved.add(match);
	}
	return [...resolved];
}

/** Rejects updates that materialize would refuse, before the Profile is written. */
export function assertApplicable(
	items: SelectableSkill[],
	updates: Record<string, SelectionState>
): void {
	const enabledIds = new Map<string, string>();
	for (const item of items) {
		const state = updates[item.id] ?? item.state;
		if (state !== "enabled") continue;
		if (item.status !== "present") {
			if (updates[item.id]) throw new Error(`Skill removed upstream: ${item.id}.`);
			continue;
		}
		const other = enabledIds.get(item.name);
		if (other) {
			throw new Error(`Enabled skill name conflict: ${item.name} from ${other} and ${item.id}.`);
		}
		enabledIds.set(item.name, item.id);
	}
}

async function selectionCommand(
	args: string[],
	options: SelectionOptions,
	state: SelectionState
): Promise<void> {
	const verb = state === "enabled" ? "enable" : "disable";
	if (args.length === 0) fail(`Usage: gitgud ${verb} <skill...>`, options.format);

	try {
		const items = await buildSelectableSkills(options.scope);
		const updates: Record<string, SelectionState> = {};
		for (const item of resolveSkills(args, items)) {
			if (item.state !== state) updates[item.id] = state;
		}
		assertApplicable(items, updates);

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

		process.stdout.write(
			`${state === "enabled" ? "Enabled" : "Disabled"} ${Object.keys(updates).length} skill(s).\n`
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown selection error";
		fail(message, options.format);
	}
}

export async function enableCommand(args: string[], options: SelectionOptions): Promise<void> {
	await selectionCommand(args, options, "enabled");
}

export async function disableCommand(args: string[], options: SelectionOptions): Promise<void> {
	await selectionCommand(args, options, "disabled");
}
