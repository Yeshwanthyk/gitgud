import { parse as parseYaml } from "yaml";

import { err, ok, type Result, type SkillFrontmatter } from "../types";

const FRONTMATTER_REGEX = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;
// Spec: lowercase letters/numbers/hyphens, no leading/trailing hyphen, no consecutive hyphens
const NAME_REGEX = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_COMPATIBILITY_LENGTH = 500;
function normalizeAllowedTools(value: unknown): Result<string[] | undefined> {
	if (value === undefined) return ok(undefined);

	if (Array.isArray(value)) {
		const parts: string[] = [];
		for (const item of value) {
			if (typeof item !== "string" || item.trim().length === 0) {
				return err(new Error("Frontmatter allowed-tools array must contain non-empty strings"));
			}
			parts.push(item.trim());
		}
		if (parts.length === 0) {
			return err(new Error("Frontmatter allowed-tools cannot be empty"));
		}
		return ok(parts);
	}

	if (typeof value !== "string") {
		return err(new Error("Frontmatter allowed-tools must be a string or string array"));
	}

	const parts = value
		.trim()
		.split(/\s+/)
		.filter((part) => part.length > 0);

	if (parts.length === 0) {
		return err(new Error("Frontmatter allowed-tools cannot be empty"));
	}

	return ok(parts);
}

function normalizeMetadata(value: unknown): Result<Record<string, string> | undefined> {
	if (value === undefined) return ok(undefined);
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return err(new Error("Frontmatter metadata must be a YAML mapping"));
	}

	// Harnesses ignore metadata, so a nested or non-string value is kept as text
	// rather than rejecting the skill.
	const record = value as Record<string, unknown>;
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(record)) {
		if (v === null || v === undefined) continue;
		out[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
	}
	return ok(out);
}

const TOP_LEVEL_PLAIN_VALUE = /^([A-Za-z0-9_-]+):[ \t]+(\S.*?)[ \t]*$/;
const YAML_VALUE_INDICATOR = /^['"|>[{&*!%@`]/;

/**
 * Quote top-level plain values that strict YAML rejects, such as
 * `description: Do X: then Y`. Returns undefined when nothing needed quoting.
 */
function repairFrontmatterYaml(yamlText: string): string | undefined {
	let changed = false;
	const lines = yamlText.split(/\r?\n/).map((line) => {
		const match = line.match(TOP_LEVEL_PLAIN_VALUE);
		if (!match) return line;
		const [, key, value] = match as unknown as [string, string, string];
		if (YAML_VALUE_INDICATOR.test(value) || !/: |:$/.test(value)) return line;
		changed = true;
		return `${key}: '${value.replace(/'/g, "''")}'`;
	});
	return changed ? lines.join("\n") : undefined;
}

function parseYamlText(yamlText: string): Result<unknown> {
	try {
		return ok(parseYaml(yamlText));
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown YAML parse error";
		return err(new Error(`Invalid YAML frontmatter: ${message}`));
	}
}

export function parseFrontmatter(content: string): Result<SkillFrontmatter> {
	const normalized = content.replace(/^\uFEFF/, "");
	const match = normalized.match(FRONTMATTER_REGEX);

	if (!match) {
		return err(new Error("No frontmatter block found"));
	}

	const yamlText = match[1] as string;
	let parsed = parseYamlText(yamlText);
	if (!parsed.ok) {
		const repaired = repairFrontmatterYaml(yamlText);
		if (repaired === undefined) return err(parsed.error);
		parsed = parseYamlText(repaired);
		if (!parsed.ok) return err(parsed.error);
	}

	return validateFrontmatter(parsed.value);
}

/**
 * Rewrite a manifest whose frontmatter only parses after repair, so harnesses
 * with strict YAML parsers (Pi) load the installed copy. Returns the new
 * content, or undefined when the manifest is already strict YAML.
 */
export function repairManifest(content: string): string | undefined {
	const normalized = content.replace(/^\uFEFF/, "");
	const match = normalized.match(FRONTMATTER_REGEX);
	if (!match) return undefined;
	const yamlText = match[1] as string;
	if (parseYamlText(yamlText).ok) return undefined;
	const repaired = repairFrontmatterYaml(yamlText);
	if (repaired === undefined || !parseYamlText(repaired).ok) return undefined;
	const start = normalized.indexOf(yamlText);
	return normalized.slice(0, start) + repaired + normalized.slice(start + yamlText.length);
}

interface RawFrontmatter {
	name: unknown;
	description: unknown;
	license: unknown;
	compatibility: unknown;
	"allowed-tools": unknown;
	metadata: unknown;
	"disable-model-invocation": unknown;
}

export function validateFrontmatter(data: unknown): Result<SkillFrontmatter> {
	if (data === null || typeof data !== "object" || Array.isArray(data)) {
		return err(new Error("Frontmatter must be a YAML mapping"));
	}

	const raw = data as RawFrontmatter;

	// name (required)
	const name = raw.name;
	if (typeof name !== "string" || name.trim().length === 0) {
		return err(new Error("Frontmatter requires a non-empty name"));
	}
	const normalizedName = name.trim();
	if (!NAME_REGEX.test(normalizedName)) {
		return err(
			new Error(
				"Frontmatter name must be lowercase letters/numbers/hyphens, no leading/trailing/consecutive hyphens, ≤64 chars"
			)
		);
	}

	// description (required)
	const description = raw.description;
	if (typeof description !== "string" || description.trim().length === 0) {
		return err(new Error("Frontmatter requires a non-empty description"));
	}
	const normalizedDescription = description.trim();
	if (normalizedDescription.length > MAX_DESCRIPTION_LENGTH) {
		return err(new Error(`Frontmatter description must be ≤ ${MAX_DESCRIPTION_LENGTH} characters`));
	}

	// license (optional)
	const license = raw.license;
	if (license !== undefined && typeof license !== "string") {
		return err(new Error("Frontmatter license must be a string"));
	}
	const normalizedLicense = typeof license === "string" ? license.trim() : undefined;

	// compatibility (optional)
	const compatibility = raw.compatibility;
	let normalizedCompatibility: string | undefined;
	if (compatibility !== undefined) {
		if (typeof compatibility !== "string") {
			return err(new Error("Frontmatter compatibility must be a string"));
		}
		normalizedCompatibility = compatibility.trim();
		if (!normalizedCompatibility) {
			return err(new Error("Frontmatter compatibility cannot be empty"));
		}
		if (normalizedCompatibility.length > MAX_COMPATIBILITY_LENGTH) {
			return err(
				new Error(`Frontmatter compatibility must be ≤ ${MAX_COMPATIBILITY_LENGTH} characters`)
			);
		}
	}

	// allowed-tools (optional)
	const allowedToolsResult = normalizeAllowedTools(raw["allowed-tools"]);
	if (!allowedToolsResult.ok) return err(allowedToolsResult.error);

	// metadata (optional)
	const metadataResult = normalizeMetadata(raw.metadata);
	if (!metadataResult.ok) return err(metadataResult.error);

	// Build result object, only including optional fields if they have values
	const result: SkillFrontmatter = {
		name: normalizedName,
		description: normalizedDescription,
	};

	if (normalizedLicense) result.license = normalizedLicense;
	if (normalizedCompatibility) result.compatibility = normalizedCompatibility;
	if (allowedToolsResult.value) result.allowedTools = allowedToolsResult.value;
	if (metadataResult.value) result.metadata = metadataResult.value;

	// disable-model-invocation (optional, Anthropic Skills spec)
	const disableInvocation = raw["disable-model-invocation"];
	if (disableInvocation !== undefined) {
		if (typeof disableInvocation !== "boolean") {
			return err(new Error("Frontmatter disable-model-invocation must be a boolean"));
		}
		result.disableModelInvocation = disableInvocation;
	}

	return ok(result);
}
