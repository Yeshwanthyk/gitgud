import { existsSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Scope } from "../types";
import { ensureDir, getLockfilePath } from "./paths";

type LockedSkillStatus = "present" | "removed-upstream";

export type LockedSkill = {
	id: string;
	sourceId: string;
	name: string;
	description: string;
	subpath: string;
	status: LockedSkillStatus;
	contentHash: string;
	commit: string;
	lastSeenCommit: string;
	lastSeenAt: string;
	removedAt?: string;
};

export type LockedSource = {
	id: string;
	type: "github";
	repo: string;
	url: string;
	ref: string;
	subdir?: string;
	resolvedCommit: string;
	fetchedAt: string;
	skills: Record<string, LockedSkill>;
};

export type GitgudLockfile = {
	version: 1;
	sources: Record<string, LockedSource>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function emptyLockfile(): GitgudLockfile {
	return { version: 1, sources: {} };
}

function parseStatus(value: unknown): LockedSkillStatus {
	if (value === "present" || value === "removed-upstream") return value;
	throw new Error("Invalid lockfile skill status.");
}

function parseSkill(value: unknown): LockedSkill {
	if (!isRecord(value)) throw new Error("Invalid lockfile skill.");
	const id = value["id"];
	const sourceId = value["sourceId"];
	const name = value["name"];
	const description = value["description"];
	const subpath = value["subpath"];
	const contentHash = value["contentHash"];
	const commit = value["commit"];
	const lastSeenCommit = value["lastSeenCommit"];
	const lastSeenAt = value["lastSeenAt"];
	const removedAt = value["removedAt"];

	if (
		typeof id !== "string" ||
		typeof sourceId !== "string" ||
		typeof name !== "string" ||
		typeof description !== "string" ||
		typeof subpath !== "string" ||
		typeof contentHash !== "string" ||
		typeof commit !== "string" ||
		typeof lastSeenCommit !== "string" ||
		typeof lastSeenAt !== "string"
	) {
		throw new Error("Invalid lockfile skill.");
	}
	if (removedAt !== undefined && typeof removedAt !== "string") {
		throw new Error("Invalid lockfile removedAt.");
	}

	return {
		id,
		sourceId,
		name,
		description,
		subpath,
		status: parseStatus(value["status"]),
		contentHash,
		commit,
		lastSeenCommit,
		lastSeenAt,
		...(removedAt !== undefined ? { removedAt } : {}),
	};
}

function parseSource(value: unknown): LockedSource {
	if (!isRecord(value)) throw new Error("Invalid lockfile source.");
	const id = value["id"];
	const type = value["type"];
	const repo = value["repo"];
	const url = value["url"];
	const ref = value["ref"];
	const subdir = value["subdir"];
	const resolvedCommit = value["resolvedCommit"];
	const fetchedAt = value["fetchedAt"];
	const skillsRaw = value["skills"];

	if (
		typeof id !== "string" ||
		type !== "github" ||
		typeof repo !== "string" ||
		typeof url !== "string" ||
		typeof ref !== "string" ||
		typeof resolvedCommit !== "string" ||
		typeof fetchedAt !== "string" ||
		!isRecord(skillsRaw)
	) {
		throw new Error("Invalid lockfile source.");
	}
	if (subdir !== undefined && typeof subdir !== "string") {
		throw new Error("Invalid lockfile source subdir.");
	}

	const skills: Record<string, LockedSkill> = {};
	for (const [subpathKey, skillRaw] of Object.entries(skillsRaw)) {
		const skill = parseSkill(skillRaw);
		if (skill.subpath !== subpathKey) {
			throw new Error(`Lockfile subpath mismatch: ${subpathKey}`);
		}
		skills[subpathKey] = skill;
	}

	return {
		id,
		type: "github",
		repo,
		url,
		ref,
		...(subdir !== undefined ? { subdir } : {}),
		resolvedCommit,
		fetchedAt,
		skills,
	};
}

export function parseLockfile(value: unknown): GitgudLockfile {
	if (!isRecord(value)) throw new Error("Invalid lockfile.");
	if (value["version"] !== 1) throw new Error("Unsupported lockfile version.");
	if (!isRecord(value["sources"])) throw new Error("Invalid lockfile sources.");

	const sources: Record<string, LockedSource> = {};
	for (const [sourceId, sourceRaw] of Object.entries(value["sources"])) {
		const source = parseSource(sourceRaw);
		if (source.id !== sourceId) throw new Error(`Lockfile source id mismatch: ${sourceId}`);
		sources[sourceId] = source;
	}

	return { version: 1, sources };
}

function requireLockfilePath(scope: Scope): string {
	const lockfilePath = getLockfilePath(scope);
	if (!lockfilePath) throw new Error("Local gitgud lockfile not found.");
	return lockfilePath;
}

export async function readLockfile(scope: Scope): Promise<GitgudLockfile> {
	const lockfilePath = requireLockfilePath(scope);
	if (!existsSync(lockfilePath)) return emptyLockfile();
	const raw = await readFile(lockfilePath, "utf8");
	return parseLockfile(JSON.parse(raw) as unknown);
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
	ensureDir(path.dirname(filePath));
	const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
	await rename(tmpPath, filePath);
}

export async function writeLockfile(scope: Scope, lockfile: GitgudLockfile): Promise<void> {
	const lockfilePath = requireLockfilePath(scope);
	await atomicWriteJson(lockfilePath, lockfile);
}
