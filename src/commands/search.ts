import { readFile } from "node:fs/promises";
import path from "node:path";

import { getAllSkills } from "../core/skills";
import { formatError } from "../output";
import type { OutputFormat, Skill } from "../types";

export type SearchOptions = {
	format: OutputFormat;
};

type LineMatch = {
	line: number;
	text: string;
};

export type SearchResult = {
	skill: Skill;
	matchedName: boolean;
	matchedDescription: boolean;
	matches: LineMatch[];
};

const MAX_MATCHES_PER_SKILL = 5;

async function searchSkill(skill: Skill, keywordLower: string): Promise<SearchResult | null> {
	const matchedName = skill.name.toLowerCase().includes(keywordLower);
	const matchedDescription = skill.description.toLowerCase().includes(keywordLower);

	const matches: LineMatch[] = [];
	const skillFile = path.join(skill.path, "SKILL.md");

	try {
		const content = await readFile(skillFile, "utf8");
		const lines = content.split(/\r?\n/);
		for (let i = 0; i < lines.length; i += 1) {
			const lineText = lines[i];
			if (lineText?.toLowerCase().includes(keywordLower)) {
				matches.push({ line: i + 1, text: lineText });
				if (matches.length >= MAX_MATCHES_PER_SKILL) break;
			}
		}
	} catch {
		// Ignore read errors for searching; name/description may still match.
	}

	if (!matchedName && !matchedDescription && matches.length === 0) {
		return null;
	}

	return { skill, matchedName, matchedDescription, matches };
}

export async function searchCommand(args: string[], options: SearchOptions): Promise<void> {
	const query = args.join(" ").trim();
	if (!query) {
		process.stderr.write(`${formatError("Missing search query.", options.format)}\n`);
		process.exit(1);
	}

	const keywordLower = query.toLowerCase();
	const skills = getAllSkills();

	const results: SearchResult[] = [];
	for (const skill of skills) {
		const res = await searchSkill(skill, keywordLower);
		if (res) results.push(res);
	}

	if (options.format === "json") {
		process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
		return;
	}

	if (results.length === 0) {
		process.stdout.write("No matches.\n");
		return;
	}

	const blocks = results.map((res) => {
		const header = `${res.skill.name} (${res.skill.scope}) - ${res.skill.description}`;
		const hints: string[] = [];
		if (res.matchedName) hints.push("name");
		if (res.matchedDescription) hints.push("description");

		const hintLine = hints.length > 0 ? `Matched in ${hints.join(" & ")}.` : null;
		const matchLines =
			res.matches.length > 0
				? res.matches.map((m) => `  ${m.line}: ${m.text}`).join("\n")
				: "  (No SKILL.md line matches)";

		return [header, hintLine, matchLines].filter(Boolean).join("\n");
	});

	process.stdout.write(`${blocks.join("\n\n")}\n`);
}
