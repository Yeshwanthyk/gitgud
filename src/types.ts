export type Scope = "global" | "local";

export interface SkillFrontmatter {
	name: string;
	description: string;
	license?: string;
	compatibility?: string;
	allowedTools?: string[];
	metadata?: Record<string, string>;
	disableModelInvocation?: boolean;
}

export interface Skill {
	name: string;
	description: string;
	path: string;
	scope: Scope;
	frontmatter: SkillFrontmatter;
}

export interface SkillMeta {
	source: string;
	installedAt: string;
	// Where in the repo this skill came from (for multi-skill repos)
	subpath?: string;
	// Resolved git ref / commit at install time, used by `gitgud update`
	ref?: string;
}

export type InstallSource =
	| { type: "local"; path: string }
	| { type: "github"; repo: string; subdir?: string; ref?: string }
	| { type: "registry"; package: string; version?: string };

export type OutputFormat = "text" | "json" | "robot";

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T> {
	return { ok: true, value };
}

export function err<T = never>(error: Error): Result<T> {
	return { ok: false, error };
}
