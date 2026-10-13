import { parse as parseYaml } from "yaml";

import { err, ok, type Result, type SkillFrontmatter } from "../types";

const FRONTMATTER_REGEX = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;
// Spec: lowercase letters/numbers/hyphens, no leading/trailing hyphen, no consecutive hyphens
const NAME_REGEX = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_COMPATIBILITY_LENGTH = 500;
// Lenient validation follows the Agent Skills client guide: warn on issues and
// still load the skill; reject only when it cannot be loaded at all.
// https://agentskills.io/client-implementation/adding-skills-support
function normalizeAllowedTools(value: unknown, warnings: string[]): string[] | undefined {
	if (value === undefined) return undefined;

	let items: unknown[] | null = null;
	if (Array.isArray(value)) items = value;
	else if (typeof value === "string") items = value.split(/\s+/);
	if (items === null || !items.every((item) => typeof item === "string")) {
		warnings.push("allowed-tools must be a space-separated string; ignored");
		return undefined;
	}
	const parts = (items as string[]).map((item) => item.trim()).filter((item) => item.length > 0);
	return parts.length > 0 ? parts : undefined;
}

function normalizeMetadata(value: unknown, warnings: string[]): Record<string, string> | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "object" || Array.isArray(value)) {
		warnings.push("metadata must be a mapping; ignored");
		return undefined;
	}

	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		if (v === null || v === undefined) continue;
		if (typeof v === "string") {
			out[k] = v;
			continue;
		}
		warnings.push(`metadata.${k} is not a string; kept as text`);
		out[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
	}
	return out;
}

function optionalString(value: unknown, field: string, warnings: string[]): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "string") {
		warnings.push(`${field} must be a string; ignored`);
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

const TOP_LEVEL_PLAIN_VALUE = /^([A-Za-z0-9_-]+):[ \t]+(\S.*?)[ \t]*$/;
const YAML_VALUE_INDICATOR = /^['"|>[{&*!%@`]/;

/**
 * Quote top-level plain values that strict YAML rejects, such as
 * `description: Do X: then Y`. Returns undefined when nothing needed quoting.
 */
function repairFrontmatterYaml(yamlText: string): string | undefined {
	let changed = false;
	const eol = yamlText.includes("\r\n") ? "\r\n" : "\n";
	const lines = yamlText.split(/\r?\n/).map((line) => {
		const match = line.match(TOP_LEVEL_PLAIN_VALUE);
		if (!match) return line;
		const [, key, value] = match as unknown as [string, string, string];
		if (YAML_VALUE_INDICATOR.test(value) || !/: |:$/.test(value)) return line;
		changed = true;
		return `${key}: '${value.replace(/'/g, "''")}'`;
	});
	return changed ? lines.join(eol) : undefined;
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
		const validated = validateFrontmatter(parsed.value);
		if (validated.ok) {
			validated.value.warnings = [
				"unquoted value containing ': ' was quoted",
				...(validated.value.warnings ?? []),
			];
		}
		return validated;
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

// The name becomes an install directory, so it must be a single visible path
// segment: no separators, no ':', and no leading '.' (dot dirs are never scanned).
const UNSAFE_NAME = /[/\\:]|^\./;

export function validateFrontmatter(data: unknown): Result<SkillFrontmatter> {
	if (data === null || typeof data !== "object" || Array.isArray(data)) {
		return err(new Error("Frontmatter must be a YAML mapping"));
	}

	const raw = data as RawFrontmatter;
	const warnings: string[] = [];

	// name (required)
	const name = raw.name;
	if (typeof name !== "string" || name.trim().length === 0) {
		return err(new Error("Frontmatter requires a non-empty name"));
	}
	const normalizedName = name.trim();
	if (UNSAFE_NAME.test(normalizedName) || normalizedName.includes("\0")) {
		return err(new Error(`Frontmatter name is not a valid directory name: ${normalizedName}`));
	}
	if (!NAME_REGEX.test(normalizedName)) {
		warnings.push(
			"name should be lowercase letters/numbers/hyphens, no leading/trailing/consecutive hyphens, ≤64 chars"
		);
	}

	// description (required)
	const description = raw.description;
	if (typeof description !== "string" || description.trim().length === 0) {
		return err(new Error("Frontmatter requires a non-empty description"));
	}
	const normalizedDescription = description.trim();
	if (normalizedDescription.length > MAX_DESCRIPTION_LENGTH) {
		warnings.push(`description should be ≤ ${MAX_DESCRIPTION_LENGTH} characters`);
	}

	const normalizedLicense = optionalString(raw.license, "license", warnings);
	const normalizedCompatibility = optionalString(raw.compatibility, "compatibility", warnings);
	if (normalizedCompatibility && normalizedCompatibility.length > MAX_COMPATIBILITY_LENGTH) {
		warnings.push(`compatibility should be ≤ ${MAX_COMPATIBILITY_LENGTH} characters`);
	}
	const allowedTools = normalizeAllowedTools(raw["allowed-tools"], warnings);
	const metadata = normalizeMetadata(raw.metadata, warnings);

	const result: SkillFrontmatter = {
		name: normalizedName,
		description: normalizedDescription,
	};

	if (normalizedLicense) result.license = normalizedLicense;
	if (normalizedCompatibility) result.compatibility = normalizedCompatibility;
	if (allowedTools) result.allowedTools = allowedTools;
	if (metadata) result.metadata = metadata;

	// disable-model-invocation (optional, Anthropic Skills extension)
	const disableInvocation = raw["disable-model-invocation"];
	if (typeof disableInvocation === "boolean") {
		result.disableModelInvocation = disableInvocation;
	} else if (disableInvocation !== undefined) {
		warnings.push("disable-model-invocation must be a boolean; ignored");
	}

	if (warnings.length > 0) result.warnings = warnings;
	return ok(result);
}
