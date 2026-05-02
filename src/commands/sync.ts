import {
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readlinkSync,
	rmSync,
	symlinkSync,
	unlinkSync,
} from "node:fs";
import path from "node:path";

import { getAgentSkillsDirs, getGlobalSkillsDir } from "../core/paths";
import { formatError } from "../output";
import type { OutputFormat } from "../types";

type AgentName = "claude" | "codex" | "pi";

const ALL_AGENTS: AgentName[] = ["claude", "codex", "pi"];

function isAgentName(value: string): value is AgentName {
	return (ALL_AGENTS as string[]).includes(value);
}

type SyncAction = "linked" | "noop" | "relinked" | "skipped" | "replaced" | "pruned";

type SyncEntry = {
	agent: AgentName;
	skill: string;
	action: SyncAction;
	path: string;
	target?: string;
	reason?: string;
};

type SyncOptions = {
	agents?: AgentName[];
	dryRun: boolean;
	force: boolean;
	prune: boolean;
	format: OutputFormat;
	silent?: boolean;
};

function listSourceSkills(sourceDir: string): string[] {
	if (!existsSync(sourceDir)) return [];
	return readdirSync(sourceDir, { withFileTypes: true })
		.filter((d) => d.isDirectory() && !d.name.startsWith("."))
		.map((d) => d.name)
		.sort();
}

function readLinkAbs(linkPath: string): string | null {
	try {
		const raw = readlinkSync(linkPath);
		return path.isAbsolute(raw) ? raw : path.resolve(path.dirname(linkPath), raw);
	} catch {
		return null;
	}
}

function isInside(target: string, dir: string): boolean {
	return target === dir || target.startsWith(`${dir}${path.sep}`);
}

type LinkResult = { action: SyncAction; reason?: string };

function linkSkill(params: {
	skill: string;
	sourcePath: string;
	dest: string;
	sourceDir: string;
	dryRun: boolean;
	force: boolean;
}): LinkResult {
	const { sourcePath, dest, sourceDir, dryRun, force } = params;

	let lst;
	try {
		lst = lstatSync(dest);
	} catch {
		lst = null;
	}

	if (!lst) {
		if (!dryRun) symlinkSync(sourcePath, dest, "dir");
		return { action: "linked" };
	}

	if (lst.isSymbolicLink()) {
		const resolved = readLinkAbs(dest);
		if (resolved === sourcePath) {
			return { action: "noop" };
		}
		const managed = resolved !== null && isInside(resolved, sourceDir);
		if (managed) {
			if (!dryRun) {
				unlinkSync(dest);
				symlinkSync(sourcePath, dest, "dir");
			}
			return { action: "relinked" };
		}
		if (force) {
			if (!dryRun) {
				unlinkSync(dest);
				symlinkSync(sourcePath, dest, "dir");
			}
			return { action: "replaced" };
		}
		return {
			action: "skipped",
			reason: resolved ? `symlink → ${resolved}` : "broken symlink",
		};
	}

	// Real file or directory
	if (force) {
		if (!dryRun) {
			rmSync(dest, { recursive: true, force: true });
			symlinkSync(sourcePath, dest, "dir");
		}
		return { action: "replaced" };
	}
	return {
		action: "skipped",
		reason: lst.isDirectory() ? "existing directory" : "existing file",
	};
}

function pruneAgentDir(params: {
	agent: AgentName;
	agentSkillsDir: string;
	sourceDir: string;
	sourceSkills: Set<string>;
	dryRun: boolean;
}): SyncEntry[] {
	const { agent, agentSkillsDir, sourceDir, sourceSkills, dryRun } = params;
	if (!existsSync(agentSkillsDir)) return [];

	const out: SyncEntry[] = [];
	for (const entry of readdirSync(agentSkillsDir, { withFileTypes: true })) {
		const dest = path.join(agentSkillsDir, entry.name);
		let lst;
		try {
			lst = lstatSync(dest);
		} catch {
			continue;
		}
		if (!lst.isSymbolicLink()) continue;

		const resolved = readLinkAbs(dest);
		if (!resolved || !isInside(resolved, sourceDir)) continue;

		// Prune if target is gone OR the source skill no longer exists.
		const targetGone = !existsSync(resolved);
		const orphaned = !sourceSkills.has(entry.name);
		if (!targetGone && !orphaned) continue;

		if (!dryRun) unlinkSync(dest);
		out.push({
			agent,
			skill: entry.name,
			action: "pruned",
			path: dest,
			target: resolved,
			reason: targetGone ? "target missing" : "orphaned",
		});
	}
	return out;
}

export function runSync(options: SyncOptions): SyncEntry[] {
	const requested = options.agents && options.agents.length > 0 ? options.agents : ALL_AGENTS;
	const sourceDir = getGlobalSkillsDir();
	const sourceSkills = new Set(listSourceSkills(sourceDir));

	const actions: SyncEntry[] = [];

	for (const { name, dir: agentSkillsDir } of getAgentSkillsDirs()) {
		const agent = name as AgentName;
		if (!requested.includes(agent)) continue;

		const parentDir = path.dirname(agentSkillsDir);
		if (!existsSync(parentDir)) continue; // agent not installed

		if (!existsSync(agentSkillsDir) && !options.dryRun) {
			mkdirSync(agentSkillsDir, { recursive: true });
		}

		for (const skill of sourceSkills) {
			const dest = path.join(agentSkillsDir, skill);
			const sourcePath = path.join(sourceDir, skill);
			const result = linkSkill({
				skill,
				sourcePath,
				dest,
				sourceDir,
				dryRun: options.dryRun,
				force: options.force,
			});
			actions.push({
				agent,
				skill,
				action: result.action,
				path: dest,
				target: sourcePath,
				...(result.reason !== undefined ? { reason: result.reason } : {}),
			});
		}

		if (options.prune) {
			actions.push(
				...pruneAgentDir({
					agent,
					agentSkillsDir,
					sourceDir,
					sourceSkills,
					dryRun: options.dryRun,
				})
			);
		}
	}

	if (!options.silent) {
		printActions(actions, options.format, options.dryRun);
	}
	return actions;
}

type ActionCounts = Record<SyncAction, number>;

function summarize(actions: SyncEntry[]): ActionCounts {
	const counts: ActionCounts = {
		linked: 0,
		relinked: 0,
		replaced: 0,
		skipped: 0,
		pruned: 0,
		noop: 0,
	};
	for (const a of actions) counts[a.action]++;
	return counts;
}

function symbolFor(action: SyncAction): string {
	switch (action) {
		case "linked":
			return "\u2713";
		case "relinked":
		case "replaced":
			return "\u21bb";
		case "skipped":
			return "\u2192";
		case "pruned":
			return "\u2717";
		case "noop":
			return "\u00b7";
	}
}

function printActions(actions: SyncEntry[], format: OutputFormat, dryRun: boolean): void {
	if (format === "json") {
		process.stdout.write(
			`${JSON.stringify(
				{
					ok: true,
					dryRun,
					actions,
					summary: summarize(actions),
				},
				null,
				2
			)}\n`
		);
		return;
	}

	if (actions.length === 0) {
		process.stdout.write("No skills to sync.\n");
		return;
	}

	let printedAny = false;
	for (const a of actions) {
		if (a.action === "noop") continue;
		const reason = a.reason ? ` (${a.reason})` : "";
		process.stdout.write(`${symbolFor(a.action)} ${a.action} ${a.agent}/${a.skill}${reason}\n`);
		printedAny = true;
	}

	const s = summarize(actions);
	const prefix = dryRun ? "(dry-run) " : "";
	if (!printedAny) process.stdout.write(`${prefix}all up to date (${s.noop} noop)\n`);
	else
		process.stdout.write(
			`${prefix}linked=${s.linked} relinked=${s.relinked} replaced=${s.replaced} skipped=${s.skipped} pruned=${s.pruned} noop=${s.noop}\n`
		);
}

type SyncCommandOptions = {
	dryRun: boolean;
	force: boolean;
	prune: boolean;
	format: OutputFormat;
};

export function syncCommand(args: string[], options: SyncCommandOptions): void {
	const agents: AgentName[] = [];
	for (const a of args) {
		if (!isAgentName(a)) {
			process.stderr.write(
				`${formatError(`Unknown agent: ${a}. Expected one of ${ALL_AGENTS.join(", ")}.`, options.format)}\n`
			);
			process.exit(1);
		}
		agents.push(a);
	}

	runSync({
		agents,
		dryRun: options.dryRun,
		force: options.force,
		prune: options.prune,
		format: options.format,
	});
}

/** Best-effort sync used by install/uninstall/update hooks. Never throws. */
export function autoSync(): void {
	try {
		runSync({
			dryRun: false,
			force: false,
			prune: true,
			format: "text",
			silent: true,
		});
	} catch {
		// Auto-sync is best-effort; surface failures only via explicit `gitgud sync`.
	}
}
