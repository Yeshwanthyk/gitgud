import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Scope } from "../types";
import { ensureDir, getProfilePath } from "./paths";

export type SelectionState = "enabled" | "disabled";

export type GithubTrackedSource = {
	id: string;
	type: "github";
	repo: string;
	url: string;
	ref: string;
	subdir?: string;
};

type TrackedSource = GithubTrackedSource;

export type GitgudProfile = {
	version: 1;
	sources: TrackedSource[];
	selections: Record<string, SelectionState>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function emptyProfile(): GitgudProfile {
	return { version: 1, sources: [], selections: {} };
}

function parseSelection(value: unknown): SelectionState {
	if (value === "enabled" || value === "disabled") return value;
	throw new Error("Invalid profile selection state.");
}

function parseSource(value: unknown): TrackedSource {
	if (!isRecord(value)) throw new Error("Invalid profile source.");
	const id = value["id"];
	const type = value["type"];
	const repo = value["repo"];
	const url = value["url"];
	const ref = value["ref"];
	const subdir = value["subdir"];

	if (
		typeof id !== "string" ||
		type !== "github" ||
		typeof repo !== "string" ||
		typeof url !== "string" ||
		typeof ref !== "string"
	) {
		throw new Error("Invalid profile source.");
	}
	if (subdir !== undefined && typeof subdir !== "string") {
		throw new Error("Invalid profile source subdir.");
	}

	return {
		id,
		type: "github",
		repo,
		url,
		ref,
		...(subdir !== undefined ? { subdir } : {}),
	};
}

export function parseProfile(value: unknown): GitgudProfile {
	if (!isRecord(value)) throw new Error("Invalid profile.");
	if (value["version"] !== 1) throw new Error("Unsupported profile version.");
	if (!Array.isArray(value["sources"])) throw new Error("Invalid profile sources.");
	if (!isRecord(value["selections"])) throw new Error("Invalid profile selections.");

	const sources = value["sources"].map(parseSource);
	const seenSources = new Set<string>();
	for (const source of sources) {
		if (seenSources.has(source.id)) throw new Error(`Duplicate profile source: ${source.id}`);
		seenSources.add(source.id);
	}

	const selections: Record<string, SelectionState> = {};
	for (const [key, state] of Object.entries(value["selections"])) {
		selections[key] = parseSelection(state);
	}

	return { version: 1, sources, selections };
}

function requireProfilePath(scope: Scope): string {
	const profilePath = getProfilePath(scope);
	if (!profilePath) throw new Error("Local gitgud profile not found.");
	return profilePath;
}

export async function readProfile(scope: Scope): Promise<GitgudProfile> {
	const profilePath = requireProfilePath(scope);
	if (!existsSync(profilePath)) return emptyProfile();
	const raw = await readFile(profilePath, "utf8");
	return parseProfile(JSON.parse(raw) as unknown);
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
	ensureDir(path.dirname(filePath));
	const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await rename(tmpPath, filePath);
}

export async function writeProfile(scope: Scope, profile: GitgudProfile): Promise<void> {
	const profilePath = requireProfilePath(scope);
	await atomicWriteJson(profilePath, profile);
}

export function upsertSource(profile: GitgudProfile, source: TrackedSource): GitgudProfile {
	const sources = profile.sources.filter((existing) => existing.id !== source.id);
	sources.push(source);
	sources.sort((a, b) => a.id.localeCompare(b.id));
	return { ...profile, sources };
}

export function ensureSelection(
	profile: GitgudProfile,
	skillId: string,
	defaultState: SelectionState
): GitgudProfile {
	if (profile.selections[skillId]) return profile;
	return {
		...profile,
		selections: {
			...profile.selections,
			[skillId]: defaultState,
		},
	};
}

export function setSelections(
	profile: GitgudProfile,
	updates: Record<string, SelectionState>
): GitgudProfile {
	return {
		...profile,
		selections: {
			...profile.selections,
			...updates,
		},
	};
}
