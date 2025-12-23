import { parse as parseYaml } from "yaml";

import type { Result, SkillFrontmatter } from "../types";

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T = never>(error: Error): Result<T> => ({ ok: false, error });

const FRONTMATTER_REGEX = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/;
// Spec: lowercase letters/numbers/hyphens, no leading/trailing hyphen, no consecutive hyphens
const NAME_REGEX = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,63}$/;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_COMPATIBILITY_LENGTH = 500;
const ALLOWED_KEYS = new Set([
	"name",
	"description",
	"license",
	"compatibility",
	"allowed-tools",
	"metadata",
]);

function normalizeAllowedTools(value: unknown): Result<string[] | undefined> {
	if (value === undefined) return ok(undefined);

	if (typeof value !== "string") {
		return err(new Error("Frontmatter allowed-tools must be a space-delimited string"));
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

	const record = value as Record<string, unknown>;
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(record)) {
		if (typeof v !== "string") {
			return err(new Error(`Frontmatter metadata values must be strings (key: ${k})`));
		}
		out[k] = v;
	}
	return ok(out);
}

export function parseFrontmatter(content: string): Result<SkillFrontmatter> {
	const normalized = content.replace(/^\uFEFF/, "");
	const match = normalized.match(FRONTMATTER_REGEX);

	if (!match) {
		return err(new Error("No frontmatter block found"));
	}

	const yamlText = match[1] as string;
	let parsed: unknown;
	try {
		parsed = parseYaml(yamlText);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown YAML parse error";
		return err(new Error(`Invalid YAML frontmatter: ${message}`));
	}

	return validateFrontmatter(parsed);
}

function ensureAllowedKeys(record: Record<string, unknown>): Result<undefined> {
	for (const key of Object.keys(record)) {
		if (!ALLOWED_KEYS.has(key)) {
			return err(new Error(`Unknown frontmatter field: ${key}`));
		}
	}
	return ok(undefined);
}

interface RawFrontmatter {
	name: unknown;
	description: unknown;
	license: unknown;
	compatibility: unknown;
	"allowed-tools": unknown;
	metadata: unknown;
}

export function validateFrontmatter(data: unknown): Result<SkillFrontmatter> {
	if (data === null || typeof data !== "object" || Array.isArray(data)) {
		return err(new Error("Frontmatter must be a YAML mapping"));
	}

	const record = data as Record<string, unknown>;
	const allowedKeysCheck = ensureAllowedKeys(record);
	if (!allowedKeysCheck.ok) return err(allowedKeysCheck.error);

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
				"Frontmatter name must be lowercase letters/numbers/hyphens, no leading/trailing/consecutive hyphens, ≤64 chars",
			),
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
				new Error(`Frontmatter compatibility must be ≤ ${MAX_COMPATIBILITY_LENGTH} characters`),
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

	return ok(result);
}
