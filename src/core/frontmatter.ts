import { parse as parseYaml } from "yaml";

import type { Result, SkillFrontmatter } from "../types";

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T = never>(error: Error): Result<T> => ({ ok: false, error });

const FRONTMATTER_REGEX = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;

export function parseFrontmatter(content: string): Result<SkillFrontmatter> {
	const normalized = content.replace(/^\uFEFF/, "");
	const match = normalized.match(FRONTMATTER_REGEX);

	if (!match) {
		return err(new Error("No frontmatter block found"));
	}

	const yamlText = match[1];
	let parsed: unknown;
	try {
		parsed = parseYaml(yamlText);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown YAML parse error";
		return err(new Error(`Invalid YAML frontmatter: ${message}`));
	}

	return validateFrontmatter(parsed);
}

export function validateFrontmatter(data: unknown): Result<SkillFrontmatter> {
	if (data === null || typeof data !== "object" || Array.isArray(data)) {
		return err(new Error("Frontmatter must be a YAML mapping"));
	}

	const record = data as Record<string, unknown>;
	const name = record.name;
	const description = record.description;

	if (typeof name !== "string" || name.trim().length === 0) {
		return err(new Error("Frontmatter requires a non-empty name"));
	}

	if (typeof description !== "string" || description.trim().length === 0) {
		return err(new Error("Frontmatter requires a non-empty description"));
	}

	const license = record.license;
	if (license !== undefined && typeof license !== "string") {
		return err(new Error("Frontmatter license must be a string"));
	}

	const triggers = record.triggers;
	if (triggers !== undefined) {
		if (!Array.isArray(triggers)) {
			return err(new Error("Frontmatter triggers must be an array"));
		}
		for (const trigger of triggers) {
			if (typeof trigger !== "string") {
				return err(new Error("Frontmatter triggers must be strings"));
			}
		}
	}

	return ok({
		name: name.trim(),
		description: description.trim(),
		license: license as string | undefined,
		triggers: triggers as string[] | undefined,
	});
}
