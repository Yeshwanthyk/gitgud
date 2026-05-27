import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { SkillMeta } from "../types";

function isStringRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSkillMeta(value: unknown): SkillMeta | null {
	if (!isStringRecord(value)) return null;
	const { source, installedAt, subpath, ref } = value;
	if (typeof source !== "string" || typeof installedAt !== "string") return null;
	if (subpath !== undefined && typeof subpath !== "string") return null;
	if (ref !== undefined && typeof ref !== "string") return null;

	return {
		source,
		installedAt,
		...(subpath !== undefined ? { subpath } : {}),
		...(ref !== undefined ? { ref } : {}),
	};
}

export async function readSkillMeta(skillPath: string): Promise<SkillMeta | null> {
	const metaPath = path.join(skillPath, ".gitgud-meta.json");
	if (!existsSync(metaPath)) return null;
	try {
		const raw = await readFile(metaPath, "utf8");
		return parseSkillMeta(JSON.parse(raw) as unknown);
	} catch {
		return null;
	}
}

export async function writeSkillMeta(skillPath: string, meta: SkillMeta): Promise<void> {
	await writeFile(
		path.join(skillPath, ".gitgud-meta.json"),
		`${JSON.stringify(meta, null, 2)}\n`,
		"utf8"
	);
}
