import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readlinkSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { autoSync, runSync } from "../../src/commands/sync";

function makeSkillDir(root: string, name: string): string {
	const dir = path.join(root, name);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		path.join(dir, "SKILL.md"),
		`---\nname: ${name}\ndescription: test skill ${name}\n---\nbody\n`
	);
	return dir;
}

describe("sync command", () => {
	let tmpHome: string;
	let originalHome: string | undefined;

	beforeEach(() => {
		tmpHome = realpathSync(mkdtempSync(path.join(os.tmpdir(), "gitgud-sync-")));
		// biome-ignore lint/complexity/useLiteralKeys: bracket notation
		originalHome = process.env["HOME"];
		// biome-ignore lint/complexity/useLiteralKeys: bracket notation
		process.env["HOME"] = tmpHome;

		mkdirSync(path.join(tmpHome, ".gitgud", "skills"), { recursive: true });
		mkdirSync(path.join(tmpHome, ".claude"), { recursive: true });
		mkdirSync(path.join(tmpHome, ".codex"), { recursive: true });
		mkdirSync(path.join(tmpHome, ".pi", "agent"), { recursive: true });
		mkdirSync(path.join(tmpHome, ".config", "agents"), { recursive: true });
	});

	afterEach(() => {
		// biome-ignore lint/complexity/useLiteralKeys: bracket notation
		process.env["HOME"] = originalHome;
		rmSync(tmpHome, { recursive: true, force: true });
	});

	test("links each source skill into every agent dir whose parent exists", () => {
		makeSkillDir(path.join(tmpHome, ".gitgud", "skills"), "alpha");
		makeSkillDir(path.join(tmpHome, ".gitgud", "skills"), "beta");

		runSync({ dryRun: false, force: false, prune: true, format: "text", silent: true });

		for (const agent of [
			".claude/skills",
			".codex/skills",
			".pi/agent/skills",
			".config/agents/skills",
		]) {
			for (const skill of ["alpha", "beta"]) {
				const dest = path.join(tmpHome, agent, skill);
				expect(lstatSync(dest).isSymbolicLink()).toBeTrue();
				expect(realpathSync(dest)).toBe(realpathSync(path.join(tmpHome, ".gitgud/skills", skill)));
			}
		}
	});

	test("skips agents whose parent directory does not exist", () => {
		makeSkillDir(path.join(tmpHome, ".gitgud", "skills"), "alpha");
		rmSync(path.join(tmpHome, ".pi"), { recursive: true, force: true });

		runSync({ dryRun: false, force: false, prune: true, format: "text", silent: true });

		expect(existsSync(path.join(tmpHome, ".pi", "agent", "skills", "alpha"))).toBeFalse();
		expect(existsSync(path.join(tmpHome, ".claude", "skills", "alpha"))).toBeTrue();
	});

	test("filters by agents argument", () => {
		makeSkillDir(path.join(tmpHome, ".gitgud", "skills"), "alpha");

		runSync({
			agents: ["claude"],
			dryRun: false,
			force: false,
			prune: true,
			format: "text",
			silent: true,
		});

		expect(existsSync(path.join(tmpHome, ".claude", "skills", "alpha"))).toBeTrue();
		expect(existsSync(path.join(tmpHome, ".codex", "skills", "alpha"))).toBeFalse();
		expect(existsSync(path.join(tmpHome, ".pi", "agent", "skills", "alpha"))).toBeFalse();
		expect(existsSync(path.join(tmpHome, ".config", "agents", "skills", "alpha"))).toBeFalse();
	});

	test("does not overwrite a non-managed real directory", () => {
		makeSkillDir(path.join(tmpHome, ".gitgud", "skills"), "alpha");
		mkdirSync(path.join(tmpHome, ".claude", "skills"), { recursive: true });
		const userDir = path.join(tmpHome, ".claude", "skills", "alpha");
		mkdirSync(userDir);
		writeFileSync(path.join(userDir, "user-file"), "keep me");

		const actions = runSync({
			dryRun: false,
			force: false,
			prune: true,
			format: "text",
			silent: true,
		});

		expect(existsSync(path.join(userDir, "user-file"))).toBeTrue();
		expect(lstatSync(userDir).isDirectory()).toBeTrue();
		expect(lstatSync(userDir).isSymbolicLink()).toBeFalse();

		const skipped = actions.find((a) => a.agent === "claude" && a.skill === "alpha");
		expect(skipped?.action).toBe("skipped");
	});

	test("--force replaces a non-managed real directory", () => {
		makeSkillDir(path.join(tmpHome, ".gitgud", "skills"), "alpha");
		mkdirSync(path.join(tmpHome, ".claude", "skills"), { recursive: true });
		mkdirSync(path.join(tmpHome, ".claude", "skills", "alpha"));
		writeFileSync(path.join(tmpHome, ".claude", "skills", "alpha", "user-file"), "x");

		runSync({ dryRun: false, force: true, prune: true, format: "text", silent: true });

		const dest = path.join(tmpHome, ".claude", "skills", "alpha");
		expect(lstatSync(dest).isSymbolicLink()).toBeTrue();
		expect(realpathSync(dest)).toBe(realpathSync(path.join(tmpHome, ".gitgud", "skills", "alpha")));
	});

	test("relinks a managed symlink whose target points elsewhere in the source dir", () => {
		const sourceDir = path.join(tmpHome, ".gitgud", "skills");
		makeSkillDir(sourceDir, "alpha");
		makeSkillDir(sourceDir, "beta");

		mkdirSync(path.join(tmpHome, ".claude", "skills"), { recursive: true });
		// pre-existing managed symlink: alpha -> beta (wrong target, but managed)
		symlinkSync(
			path.join(sourceDir, "beta"),
			path.join(tmpHome, ".claude", "skills", "alpha"),
			"dir"
		);

		runSync({ dryRun: false, force: false, prune: true, format: "text", silent: true });

		const dest = path.join(tmpHome, ".claude", "skills", "alpha");
		expect(realpathSync(dest)).toBe(realpathSync(path.join(sourceDir, "alpha")));
	});

	test("prune removes managed symlinks for skills no longer in source", () => {
		const sourceDir = path.join(tmpHome, ".gitgud", "skills");
		makeSkillDir(sourceDir, "alpha");
		const stale = makeSkillDir(sourceDir, "stale");

		runSync({ dryRun: false, force: false, prune: true, format: "text", silent: true });
		expect(existsSync(path.join(tmpHome, ".claude", "skills", "stale"))).toBeTrue();

		// Remove from source, then resync
		rmSync(stale, { recursive: true, force: true });
		runSync({ dryRun: false, force: false, prune: true, format: "text", silent: true });

		expect(existsSync(path.join(tmpHome, ".claude", "skills", "alpha"))).toBeTrue();
		expect(existsSync(path.join(tmpHome, ".claude", "skills", "stale"))).toBeFalse();
	});

	test("prune does not touch user-created symlinks pointing outside ~/.gitgud/skills", () => {
		makeSkillDir(path.join(tmpHome, ".gitgud", "skills"), "alpha");
		mkdirSync(path.join(tmpHome, ".claude", "skills"), { recursive: true });
		const userTarget = path.join(tmpHome, "elsewhere");
		mkdirSync(userTarget);
		symlinkSync(userTarget, path.join(tmpHome, ".claude", "skills", "user-link"), "dir");

		runSync({ dryRun: false, force: false, prune: true, format: "text", silent: true });

		const userLink = path.join(tmpHome, ".claude", "skills", "user-link");
		expect(lstatSync(userLink).isSymbolicLink()).toBeTrue();
		expect(readlinkSync(userLink)).toBe(userTarget);
	});

	test("reports unmanaged directories, files, and foreign links without changing them", () => {
		const agentSkillsDir = path.join(tmpHome, ".claude", "skills");
		mkdirSync(agentSkillsDir);
		const userDir = path.join(agentSkillsDir, "yesh-mode");
		const userFile = path.join(agentSkillsDir, "notes.txt");
		const userLink = path.join(agentSkillsDir, "references");
		const target = path.join(tmpHome, "shared-references");
		mkdirSync(userDir);
		writeFileSync(path.join(userDir, "keep"), "keep me");
		writeFileSync(userFile, "keep me");
		mkdirSync(target);
		symlinkSync(target, userLink, "dir");

		// Worst-case flags must still leave unmanaged entries untouched.
		const actions = runSync({
			agents: ["claude"],
			dryRun: false,
			force: true,
			prune: true,
			format: "text",
			silent: true,
		});
		expect(
			actions.filter((a) => a.action === "unmanaged").sort((a, b) => a.skill.localeCompare(b.skill))
		).toEqual([
			{
				agent: "claude",
				skill: "notes.txt",
				action: "unmanaged",
				path: userFile,
				reason: "existing file",
			},
			{
				agent: "claude",
				skill: "references",
				action: "unmanaged",
				path: userLink,
				reason: `symlink → ${target}`,
			},
			{
				agent: "claude",
				skill: "yesh-mode",
				action: "unmanaged",
				path: userDir,
				reason: "existing directory",
			},
		]);
		expect(lstatSync(userDir).isDirectory()).toBeTrue();
		expect(existsSync(path.join(userDir, "keep"))).toBeTrue();
		expect(lstatSync(userFile).isFile()).toBeTrue();
		expect(lstatSync(userLink).isSymbolicLink()).toBeTrue();
		expect(readlinkSync(userLink)).toBe(target);
	});

	test("excludes managed skills, dotfiles, and links into the global store", () => {
		const sourceDir = path.join(tmpHome, ".gitgud", "skills");
		makeSkillDir(sourceDir, "alpha");
		const agentSkillsDir = path.join(tmpHome, ".claude", "skills");
		mkdirSync(agentSkillsDir);
		mkdirSync(path.join(agentSkillsDir, ".system"));
		writeFileSync(path.join(agentSkillsDir, ".DS_Store"), "metadata");
		symlinkSync(path.join(sourceDir, "retired"), path.join(agentSkillsDir, "retired"), "dir");

		const actions = runSync({
			agents: ["claude"],
			dryRun: false,
			force: false,
			prune: false,
			format: "text",
			silent: true,
		});

		expect(actions.filter((a) => a.action === "unmanaged")).toEqual([]);
		expect(actions.find((a) => a.skill === "alpha")?.action).toBe("linked");
		expect(lstatSync(path.join(agentSkillsDir, "retired")).isSymbolicLink()).toBeTrue();
	});

	test("prints unmanaged entries in text and JSON, while auto-sync stays silent", () => {
		const agentSkillsDir = path.join(tmpHome, ".claude", "skills");
		mkdirSync(agentSkillsDir);
		mkdirSync(path.join(agentSkillsDir, "yesh-mode"));
		const originalWrite = process.stdout.write;
		let output = "";
		process.stdout.write = ((chunk: string | Uint8Array) => {
			output += chunk.toString();
			return true;
		}) as typeof process.stdout.write;
		try {
			const options = { dryRun: false, force: false, prune: false };
			runSync({ ...options, agents: ["claude"], format: "text" });
			const text = output.replace(/\x1b\[[0-9;]*m/g, "");
			expect(text).toContain("? unmanaged  yesh-mode");
			expect(text).toContain("1 unmanaged");

			output = "";
			runSync({ ...options, agents: ["claude"], format: "json" });
			const json = JSON.parse(output);
			expect(json.actions).toContainEqual({
				agent: "claude",
				skill: "yesh-mode",
				action: "unmanaged",
				path: path.join(agentSkillsDir, "yesh-mode"),
				reason: "existing directory",
			});
			expect(json.summary.unmanaged).toBe(1);

			output = "";
			autoSync();
			expect(output).toBe("");
		} finally {
			process.stdout.write = originalWrite;
		}
	});

	test("--no-prune leaves dangling managed symlinks alone", () => {
		const sourceDir = path.join(tmpHome, ".gitgud", "skills");
		makeSkillDir(sourceDir, "alpha");
		const stale = makeSkillDir(sourceDir, "stale");

		runSync({ dryRun: false, force: false, prune: true, format: "text", silent: true });
		rmSync(stale, { recursive: true, force: true });

		runSync({ dryRun: false, force: false, prune: false, format: "text", silent: true });

		expect(lstatSync(path.join(tmpHome, ".claude", "skills", "stale")).isSymbolicLink()).toBeTrue();
	});

	test("dry-run reports actions without writing", () => {
		makeSkillDir(path.join(tmpHome, ".gitgud", "skills"), "alpha");

		const actions = runSync({
			dryRun: true,
			force: false,
			prune: true,
			format: "text",
			silent: true,
		});

		expect(actions.some((a) => a.action === "linked")).toBeTrue();
		expect(existsSync(path.join(tmpHome, ".claude", "skills", "alpha"))).toBeFalse();
	});

	test("re-running sync produces only noop actions", () => {
		makeSkillDir(path.join(tmpHome, ".gitgud", "skills"), "alpha");
		runSync({ dryRun: false, force: false, prune: true, format: "text", silent: true });

		const actions = runSync({
			dryRun: false,
			force: false,
			prune: true,
			format: "text",
			silent: true,
		});

		const nonNoop = actions.filter((a) => a.action !== "noop");
		expect(nonNoop).toEqual([]);
	});
});
