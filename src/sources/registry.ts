import type { Result } from "../types";
import { installFromGithub } from "./github";

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T = never>(error: Error): Result<T> => ({ ok: false, error });

export type InstallFromRegistryOptions = {
	identifier: string;
	targetDir: string;
};

// Response from /api/skills/{owner}/{repo}/{skill}
type SkillResponse = {
	sourceUrl?: string;
	error?: string;
};

async function resolveRegistrySkill(
	identifier: string,
): Promise<Result<{ sourceUrl: string }>> {
	// Parse identifier: @owner/repo/skill or owner/repo/skill
	// Note: The API requires the @ to be included in the path
	const parts = identifier.split("/");

	if (parts.length !== 3) {
		return err(
			new Error(
				`Invalid skill identifier format: ${identifier}. Expected: @owner/repo/skill`,
			),
		);
	}

	const [owner, repo, skill] = parts;

	// Use the /api/skills/ endpoint (same as claude-plugins CLI)
	const endpoint = `https://api.claude-plugins.dev/api/skills/${owner}/${repo}/${skill}`;

	let response: Response;
	try {
		response = await fetch(endpoint, {
			headers: { accept: "application/json" },
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown network error";
		return err(new Error(`Failed to reach claude-plugins registry: ${message}`));
	}

	if (!response.ok) {
		let details = "";
		try {
			const json = (await response.json()) as { error?: string };
			details = json.error ?? "";
		} catch {
			try {
				details = await response.text();
			} catch {
				details = "";
			}
		}
		const statusMsg = `${response.status} ${response.statusText}`.trim();
		const suffix = details ? `: ${details}` : "";
		return err(new Error(`Registry resolve failed for ${identifier}: ${statusMsg}${suffix}`));
	}

	let data: SkillResponse;
	try {
		data = (await response.json()) as SkillResponse;
	} catch {
		return err(new Error(`Registry returned invalid JSON for ${identifier}`));
	}

	if (!data.sourceUrl || typeof data.sourceUrl !== "string") {
		return err(new Error(`Registry did not return sourceUrl for ${identifier}`));
	}

	return ok({ sourceUrl: data.sourceUrl });
}

// Normalize GitHub path from sourceUrl (e.g., "anthropics/claude-code/tree/main/plugins/...")
function normalizeGithubPath(sourceUrl: string): string {
	// Remove leading/trailing slashes
	let path = sourceUrl.replace(/^\/+|\/+$/g, "");

	// Handle full GitHub URLs
	if (path.includes("github.com")) {
		const match = path.match(/github\.com\/(.+)/);
		if (match) {
			path = match[1];
		}
	}

	// The sourceUrl from registry is in format: owner/repo/tree/branch/path
	// giget expects: owner/repo/path (without tree/branch)
	const treeMatch = path.match(/^([^/]+\/[^/]+)\/tree\/[^/]+\/(.+)$/);
	if (treeMatch) {
		return `${treeMatch[1]}/${treeMatch[2]}`;
	}

	return path;
}

export async function installFromRegistry(
	options: InstallFromRegistryOptions,
): Promise<Result<string>> {
	const identifier = options.identifier.trim();
	if (!identifier) {
		return err(new Error("Empty registry identifier"));
	}

	const resolved = await resolveRegistrySkill(identifier);
	if (!resolved.ok) return err(resolved.error);

	// Convert sourceUrl to GitHub URL format for installFromGithub
	const normalizedPath = normalizeGithubPath(resolved.value.sourceUrl);
	const [owner, repo, ...rest] = normalizedPath.split("/");

	if (!owner || !repo) {
		return err(new Error(`Invalid sourceUrl from registry: ${resolved.value.sourceUrl}`));
	}

	const subpath = rest.length > 0 ? rest.join("/") : undefined;

	return await installFromGithub({
		url: `https://github.com/${owner}/${repo}`,
		subpath,
		targetDir: options.targetDir,
	});
}
