import path from "node:path";
import { paint } from "./core/colors";
import type { OutputFormat, Skill } from "./types";

const dim = (text: string): string => paint("\x1b[2m", text);
const blue = (text: string): string => paint("\x1b[38;5;111m", text);
const pink = (text: string): string => paint("\x1b[38;5;211m", text);

const MAX_NAME_WIDTH = 30;
const MIN_DESC_WIDTH = 20;

function termWidth(): number {
	const cols = process.stdout.columns;
	return typeof cols === "number" && cols > 0 ? cols : 100;
}

function truncate(text: string, max: number): string {
	if (max <= 1) return text.slice(0, Math.max(0, max));
	const clean = text.replace(/\s+/g, " ").trim();
	return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export function formatSkillList(skills: Skill[], format: OutputFormat): string {
	if (format === "json") {
		return JSON.stringify(skills, null, 2);
	}

	if (format === "robot") {
		// TSV: name<tab>path/to/SKILL.md
		return skills.map((skill) => `${skill.name}\t${path.join(skill.path, "SKILL.md")}`).join("\n");
	}

	if (skills.length === 0) return "";

	const localCount = skills.filter((s) => s.scope === "local").length;
	const globalCount = skills.length - localCount;

	const nameWidth = Math.min(
		MAX_NAME_WIDTH,
		skills.reduce((max, s) => Math.max(max, s.name.length), 0)
	);

	const width = termWidth();
	const descWidth = Math.max(MIN_DESC_WIDTH, width - nameWidth - 2);

	const headerParts = [`${skills.length} skills`];
	if (localCount > 0) headerParts.push(`${blue("local")} ${localCount}`);
	if (globalCount > 0) headerParts.push(`${pink("global")} ${globalCount}`);
	const header = dim(headerParts.join(" · "));

	const rows = skills.map((skill) => {
		const color = skill.scope === "local" ? blue : pink;
		const displayName = truncate(skill.name, nameWidth);
		const pad = " ".repeat(Math.max(0, nameWidth - displayName.length));
		return `${color(displayName)}${pad}  ${truncate(skill.description, descWidth)}`;
	});

	return `${header}\n\n${rows.join("\n")}`;
}

export function formatSkillDetail(
	skill: Skill,
	content: string,
	format: OutputFormat,
	basePath: string = skill.path
): string {
	if (format === "json") {
		return JSON.stringify({ ...skill, base: basePath, content }, null, 2);
	}

	if (format === "robot") {
		// Raw SKILL.md content only
		return content;
	}

	return `Skill: ${skill.name}\nBase: ${basePath}\n\n---\n${content}`;
}

export function formatError(message: string, format: OutputFormat): string {
	if (format === "json") {
		return JSON.stringify({ error: message }, null, 2);
	}

	return `Error: ${message}`;
}
