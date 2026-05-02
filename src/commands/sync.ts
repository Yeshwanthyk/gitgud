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
import os from "node:os";
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

const ANSI = {
	reset: "\x1b[0m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	gray: "\x1b[90m",
} as const;

function useColor(): boolean {
	// biome-ignore lint/complexity/useLiteralKeys: bracket notation
	if (process.env["NO_COLOR"]) return false;
	return Boolean(process.stdout.isTTY);
}

function paint(color: string, str: string): string {
	return useColor() ? `${color}${str}${ANSI.reset}` : str;
}

type ActionStyle = { symbol: string; color: string; label: string };

function styleFor(action: SyncAction): ActionStyle {
	switch (action) {
		case "linked":
			return { symbol: "\u2713", color: ANSI.green, label: "linked" };
		case "relinked":
			return { symbol: "\u21bb", color: ANSI.cyan, label: "relinked" };
		case "replaced":
			return { symbol: "\u21bb", color: ANSI.magenta, label: "replaced" };
		case "skipped":
			return { symbol: "\u2192", color: ANSI.yellow, label: "skipped" };
		case "pruned":
			return { symbol: "\u2717", color: ANSI.red, label: "pruned" };
		case "noop":
			return { symbol: "\u00b7", color: ANSI.gray, label: "noop" };
	}
}

function homify(input: string): string {
	// biome-ignore lint/complexity/useLiteralKeys: bracket notation
	const envHome = process.env["HOME"];
	const home = envHome && envHome.length > 0 ? envHome : os.homedir();
	if (!home) return input;
	return input.split(home).join("~");
}

const AGENT_ORDER: AgentName[] = ["claude", "codex", "pi"];
const LABEL_WIDTH = 8; // longest label is "relinked"

function printAgentSection(agent: AgentName, entries: SyncEntry[]): void {
	const nonNoop = entries.filter((e) => e.action !== "noop");
	const noopCount = entries.length - nonNoop.length;
	if (nonNoop.length === 0 && noopCount === 0) return;

	process.stdout.write(`${paint(ANSI.bold, agent)}\n`);

	const skillWidth = nonNoop.reduce((max, e) => Math.max(max, e.skill.length), 0);

	for (const e of nonNoop) {
		const style = styleFor(e.action);
		const symbol = paint(style.color, style.symbol);
		const label = paint(style.color, style.label.padEnd(LABEL_WIDTH));
		const skill = e.reason ? e.skill.padEnd(skillWidth) : e.skill;
		const reason = e.reason ? `  ${paint(ANSI.gray, `\u2014 ${homify(e.reason)}`)}` : "";
		process.stdout.write(`  ${symbol} ${label}  ${skill}${reason}\n`);
	}

	if (noopCount > 0) {
		const style = styleFor("noop");
		process.stdout.write(
			`  ${paint(style.color, `${style.symbol} ${noopCount} already in sync`)}\n`
		);
	}

	process.stdout.write("\n");
}

function renderSummary(s: ActionCounts): string {
	const parts: string[] = [];
	const push = (n: number, color: string, label: string): void => {
		if (n === 0) return;
		parts.push(paint(color, `${n} ${label}`));
	};
	push(s.linked, ANSI.green, "linked");
	push(s.relinked, ANSI.cyan, "relinked");
	push(s.replaced, ANSI.magenta, "replaced");
	push(s.skipped, ANSI.yellow, "skipped");
	push(s.pruned, ANSI.red, "pruned");
	push(s.noop, ANSI.gray, "noop");
	if (parts.length === 0) return paint(ANSI.dim, "nothing changed");
	return parts.join(paint(ANSI.dim, " \u00b7 "));
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

	if (dryRun) process.stdout.write(`${paint(ANSI.dim, "(dry-run)")}\n\n`);

	const byAgent = new Map<AgentName, SyncEntry[]>();
	for (const a of actions) {
		const bucket = byAgent.get(a.agent);
		if (bucket) bucket.push(a);
		else byAgent.set(a.agent, [a]);
	}

	for (const agent of AGENT_ORDER) {
		const entries = byAgent.get(agent);
		if (!entries) continue;
		printAgentSection(agent, entries);
	}

	process.stdout.write(`${renderSummary(summarize(actions))}\n`);
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
