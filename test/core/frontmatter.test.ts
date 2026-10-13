import { describe, expect, test } from "bun:test";

import { parse as parseYaml } from "yaml";

import { parseFrontmatter, repairManifest, validateFrontmatter } from "../../src/core/frontmatter";

const readFixture = async (name: string) => {
	const path = `test/fixtures/${name}/SKILL.md`;
	return await Bun.file(path).text();
};

describe("parseFrontmatter", () => {
	test("parses minimal fixture", async () => {
		const content = await readFixture("minimal-skill");
		const result = parseFrontmatter(content);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value).toEqual({
				name: "minimal-skill",
				description: "Minimal required frontmatter only.",
			});
		}
	});

	test("parses full valid fixture", async () => {
		const content = await readFixture("valid-skill");
		const result = parseFrontmatter(content);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.name).toBe("valid-skill");
			expect(result.value.description).toBe("A fully specified skill for tests.");
			expect(result.value.license).toBe("MIT");
			expect(result.value.compatibility).toBe("Requires git");
			expect(result.value.allowedTools).toEqual(["Read", "Grep"]);
			expect(result.value.metadata).toEqual({ category: "git", reviewer: "qa" });
		}
	});

	test("errors when no frontmatter present", async () => {
		const content = await readFixture("no-frontmatter");
		const result = parseFrontmatter(content);
		expect(result.ok).toBe(false);
	});

	test("errors when required fields missing", async () => {
		const content = await readFixture("malformed-skill");
		const result = parseFrontmatter(content);
		expect(result.ok).toBe(false);
	});
});

describe("validateFrontmatter", () => {
	test("accepts required fields", () => {
		const result = validateFrontmatter({
			name: "x",
			description: "y",
		});
		expect(result.ok).toBe(true);
	});

	test("rejects non-object", () => {
		const result = validateFrontmatter("nope");
		expect(result.ok).toBe(false);
	});

	test("rejects name with trailing hyphen", () => {
		const result = validateFrontmatter({
			name: "pdf-",
			description: "test",
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("trailing");
		}
	});

	test("rejects name with consecutive hyphens", () => {
		const result = validateFrontmatter({
			name: "pdf--processing",
			description: "test",
		});
		expect(result.ok).toBe(false);
	});

	test("rejects empty allowed-tools string", () => {
		const result = validateFrontmatter({
			name: "test",
			description: "test",
			"allowed-tools": "",
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("empty");
		}
	});

	test("accepts array allowed-tools", () => {
		const result = validateFrontmatter({
			name: "test",
			description: "test",
			"allowed-tools": ["Read", "Write"],
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.allowedTools).toEqual(["Read", "Write"]);
		}
	});

	test("rejects array allowed-tools with empty entries", () => {
		const result = validateFrontmatter({
			name: "test",
			description: "test",
			"allowed-tools": ["Read", ""],
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("non-empty strings");
		}
	});

	test("accepts space-delimited allowed-tools", () => {
		const result = validateFrontmatter({
			name: "test",
			description: "test",
			"allowed-tools": "Read Write Bash",
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.allowedTools).toEqual(["Read", "Write", "Bash"]);
		}
	});

	test("stringifies non-string metadata values", () => {
		const result = validateFrontmatter({
			name: "test",
			description: "test",
			metadata: { version: 1 },
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.metadata).toEqual({ version: "1" });
		}
	});

	test("accepts metadata with string values", () => {
		const result = validateFrontmatter({
			name: "test",
			description: "test",
			metadata: { version: "1.0", author: "test" },
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.metadata).toEqual({ version: "1.0", author: "test" });
		}
	});

	test("rejects empty compatibility", () => {
		const result = validateFrontmatter({
			name: "test",
			description: "test",
			compatibility: "",
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("empty");
		}
	});

	test("accepts unknown frontmatter fields (forward-compat)", () => {
		const result = validateFrontmatter({
			name: "test",
			description: "test",
			triggers: ["git"],
		});
		expect(result.ok).toBe(true);
	});

	test("accepts disable-model-invocation as a boolean", () => {
		const result = validateFrontmatter({
			name: "test",
			description: "test",
			"disable-model-invocation": true,
		});
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.disableModelInvocation).toBe(true);
		}
	});

	test("rejects non-boolean disable-model-invocation", () => {
		const result = validateFrontmatter({
			name: "test",
			description: "test",
			"disable-model-invocation": "yes",
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toContain("disable-model-invocation");
		}
	});
});

describe("lenient frontmatter", () => {
	const colonManifest = [
		"---",
		"name: recap",
		"description: Catch up, read-only: what happened and why it's done.",
		"disable-model-invocation: true",
		"---",
		"",
		"# Recap",
		"",
	].join("\n");

	test("accepts an unquoted description containing ': '", () => {
		const result = parseFrontmatter(colonManifest);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.description).toBe(
				"Catch up, read-only: what happened and why it's done."
			);
			expect(result.value.disableModelInvocation).toBe(true);
		}
	});

	test("keeps nested metadata as text", () => {
		const content = [
			"---",
			"name: research",
			"description: Research things.",
			"metadata:",
			"  credits:",
			"    author: Matt Pocock",
			"  version: 2",
			"---",
			"",
		].join("\n");
		const result = parseFrontmatter(content);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.metadata).toEqual({
				credits: JSON.stringify({ author: "Matt Pocock" }),
				version: "2",
			});
		}
	});

	test("repairManifest rewrites frontmatter to strict YAML and keeps the body", () => {
		const repaired = repairManifest(colonManifest);
		expect(repaired).toBeDefined();
		const yamlText = (repaired as string).split("---")[1] as string;
		expect(parseYaml(yamlText).description).toBe(
			"Catch up, read-only: what happened and why it's done."
		);
		expect((repaired as string).endsWith("---\n\n# Recap\n")).toBe(true);
	});

	test("repairManifest leaves strict YAML alone", () => {
		expect(repairManifest("---\nname: a\ndescription: 'x: y'\n---\n")).toBeUndefined();
	});
});
