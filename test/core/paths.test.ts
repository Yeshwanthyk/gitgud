import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
	ensureDir,
	getGlobalDir,
	getGlobalSkillsDir,
	getLocalDir,
	getLocalSkillsDir,
	getSkillsDir,
} from "../../src/core/paths";

// Helper to normalize paths (handles macOS /var -> /private/var symlinks)
const normalize = (p: string): string => {
	try {
		return realpathSync(p);
	} catch {
		return p;
	}
};

describe("core/paths", () => {
	let tmpRoot: string;
	let originalCwd: string;

	beforeEach(() => {
		originalCwd = process.cwd();
		tmpRoot = realpathSync(mkdtempSync(path.join(os.tmpdir(), "gitgud-paths-")));
	});

	afterEach(() => {
		process.chdir(originalCwd);
		rmSync(tmpRoot, { recursive: true, force: true });
	});

	test("getGlobalDir and getGlobalSkillsDir", () => {
		// biome-ignore lint/complexity/useLiteralKeys: TS requires bracket notation
		const home = process.env["HOME"] || os.homedir();
		expect(getGlobalDir()).toBe(path.join(home, ".gitgud"));
		expect(getGlobalSkillsDir()).toBe(path.join(home, ".gitgud", "skills"));
	});

	test("getLocalDir finds .gitgud in current directory", () => {
		const local = path.join(tmpRoot, ".gitgud");
		mkdirSync(local);
		process.chdir(tmpRoot);
		expect(normalize(getLocalDir()!)).toBe(normalize(local));
	});

	test("getLocalDir finds .gitgud in ancestor directories", () => {
		const parent = path.join(tmpRoot, "parent");
		const child = path.join(parent, "child", "grandchild");
		ensureDir(child);
		const local = path.join(parent, ".gitgud");
		ensureDir(local);

		process.chdir(child);
		expect(normalize(getLocalDir()!)).toBe(normalize(local));
	});

	test("getLocalDir returns null when not found", () => {
		const nested = path.join(tmpRoot, "a", "b");
		ensureDir(nested);
		process.chdir(nested);
		expect(getLocalDir()).toBeNull();
	});

	test("getLocalSkillsDir returns skills subdir if local dir exists", () => {
		const parent = path.join(tmpRoot, "p");
		const child = path.join(parent, "c");
		ensureDir(child);
		ensureDir(path.join(parent, ".gitgud"));
		process.chdir(child);
		expect(normalize(getLocalSkillsDir()!)).toBe(normalize(path.join(parent, ".gitgud", "skills")));
	});

	test("getSkillsDir handles global and local scopes", () => {
		expect(getSkillsDir("global")).toBe(getGlobalSkillsDir());

		const local = path.join(tmpRoot, ".gitgud");
		ensureDir(local);
		process.chdir(tmpRoot);
		expect(normalize(getSkillsDir("local")!)).toBe(normalize(path.join(local, "skills")));

		rmSync(local, { recursive: true, force: true });
		expect(getSkillsDir("local")).toBeNull();
	});

	test("ensureDir creates directories recursively", () => {
		const deep = path.join(tmpRoot, "x", "y", "z");
		expect(existsSync(deep)).toBeFalse();
		ensureDir(deep);
		expect(existsSync(deep)).toBeTrue();
	});
});
