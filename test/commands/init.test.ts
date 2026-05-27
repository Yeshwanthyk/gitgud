import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { initCommand } from "../../src/commands/init";

describe("initCommand", () => {
	const originalCwd = process.cwd();
	const originalWrite = process.stdout.write;
	let tmpRoot: string | undefined;

	afterEach(() => {
		process.chdir(originalCwd);
		process.stdout.write = originalWrite;
		if (tmpRoot) {
			rmSync(tmpRoot, { recursive: true, force: true });
			tmpRoot = undefined;
		}
	});

	it("prints the standalone HTML contract in the AGENTS.md snippet", () => {
		tmpRoot = mkdtempSync(path.join(tmpdir(), "gitgud-init-"));
		process.chdir(tmpRoot);

		let output = "";
		process.stdout.write = ((chunk: string | Uint8Array) => {
			output += chunk.toString();
			return true;
		}) as typeof process.stdout.write;

		initCommand([], { scope: "local" });

		expect(output).toContain("Add this snippet to your AGENTS.md");
		expect(output).toContain("generate a standalone `.html` file by default");
		expect(output).toContain("`<style>` block inside `<head>`");
	});
});
