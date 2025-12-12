import { describe, expect, test } from "bun:test";

import { parseFrontmatter, validateFrontmatter } from "../../src/core/frontmatter";

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
				license: undefined,
				triggers: undefined,
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
			expect(result.value.triggers).toEqual(["git", "gud"]);
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
});
