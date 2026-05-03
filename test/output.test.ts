import { describe, expect, it } from "bun:test";
import { formatError, formatSkillDetail, formatSkillList } from "../src/output";
import type { Skill } from "../src/types";

const makeSkill = (overrides: Partial<Skill> = {}): Skill => ({
	name: "foo",
	description: "does foo",
	path: "/tmp/foo",
	scope: "local",
	frontmatter: {
		name: "foo",
		description: "does foo",
	},
	...overrides,
});

describe("formatSkillList", () => {
	it("formats text list with header and aligned rows", () => {
		const skills = [
			makeSkill({ name: "a", scope: "local", description: "A skill" }),
			makeSkill({ name: "bb", scope: "global", description: "B skill" }),
		];

		// Strip ANSI so the test passes regardless of TTY detection.
		const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");
		const output = stripAnsi(formatSkillList(skills, "text"));
		expect(output).toContain("2 skills");
		expect(output).toContain("local 1");
		expect(output).toContain("global 1");
		expect(output).toContain("a   A skill");
		expect(output).toContain("bb  B skill");
	});

	it("formats json list as array", () => {
		const skills = [makeSkill({ name: "a" })];
		const output = formatSkillList(skills, "json");
		const parsed = JSON.parse(output) as Skill[];
		expect(parsed).toHaveLength(1);
		expect(parsed[0]?.name).toBe("a");
		expect(parsed[0]?.scope).toBe("local");
	});

	it("returns empty string for empty text list", () => {
		expect(formatSkillList([], "text")).toBe("");
	});
});

describe("formatSkillDetail", () => {
	it("includes skill name and base for text", () => {
		const skill = makeSkill();
		expect(formatSkillDetail(skill, "hello", "text")).toBe(
			"Skill: foo\nBase: /tmp/foo\n\n---\nhello"
		);
	});

	it("includes skill metadata and content for json", () => {
		const skill = makeSkill({ name: "bar", scope: "global" });
		const output = formatSkillDetail(skill, "content here", "json");
		const parsed = JSON.parse(output) as Skill & { content: string; base: string };
		expect(parsed.name).toBe("bar");
		expect(parsed.scope).toBe("global");
		expect(parsed.content).toBe("content here");
		expect(parsed.path).toBe("/tmp/foo");
		expect(parsed.base).toBe("/tmp/foo");
	});
});

describe("formatError", () => {
	it("formats text errors with prefix", () => {
		expect(formatError("boom", "text")).toBe("Error: boom");
	});

	it("formats json errors as object", () => {
		const parsed = JSON.parse(formatError("boom", "json")) as {
			error: string;
		};
		expect(parsed).toEqual({ error: "boom" });
	});
});
