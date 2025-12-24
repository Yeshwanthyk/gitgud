export type Scope = "global" | "local";

export interface SkillFrontmatter {
	name: string;
	description: string;
	license?: string;
	compatibility?: string;
	allowedTools?: string[];
	metadata?: Record<string, string>;
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
}

export type InstallSource =
	| { type: "local"; path: string }
	| { type: "github"; repo: string; subdir?: string; ref?: string }
	| { type: "registry"; package: string; version?: string };

export type OutputFormat = "text" | "json" | "robot";

export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
