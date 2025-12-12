import { afterEach, describe, expect, mock, test } from "bun:test";
import { installFromRegistry } from "../../src/sources/registry";

// Mock installFromGithub
const mockInstallFromGithub = mock(() =>
	Promise.resolve({ ok: true, value: "test-skill" } as const),
);

mock.module("../../src/sources/github", () => ({
	installFromGithub: mockInstallFromGithub,
}));

describe("sources/registry", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
		mockInstallFromGithub.mockClear();
	});

	test("resolves identifier and delegates to installFromGithub", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						sourceUrl:
							"anthropics/claude-code/tree/main/plugins/frontend-design/skills/frontend-design",
					}),
			} as Response),
		);

		const res = await installFromRegistry({
			identifier: "@anthropics/claude-code/frontend-design",
			targetDir: "/tmp/skills",
		});

		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.value).toBe("test-skill");
		}
	});

	test("returns a friendly error on network failure", async () => {
		globalThis.fetch = mock(() => Promise.reject(new Error("Network down")));

		const res = await installFromRegistry({
			identifier: "@scope/repo/skill",
			targetDir: "/tmp/skills",
		});

		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error.message).toContain("Failed to reach claude-plugins registry");
		}
	});

	test("returns a friendly error on 404 response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: false,
				status: 404,
				statusText: "Not Found",
				json: () => Promise.resolve({ error: "Skill not found" }),
			} as unknown as Response),
		);

		const res = await installFromRegistry({
			identifier: "@scope/repo/skill",
			targetDir: "/tmp/skills",
		});

		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error.message).toContain("not found in the claude-plugins registry");
			expect(res.error.message).toContain("https://github.com/scope/repo");
		}
	});

	test("returns an error on non-2xx response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
				json: () => Promise.resolve({ error: "Server error" }),
			} as unknown as Response),
		);

		const res = await installFromRegistry({
			identifier: "@scope/repo/skill",
			targetDir: "/tmp/skills",
		});

		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error.message).toContain("Registry resolve failed");
		}
	});

	test("returns error for invalid identifier format", async () => {
		const res = await installFromRegistry({
			identifier: "invalid-format",
			targetDir: "/tmp/skills",
		});

		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.error.message).toContain("Invalid skill identifier format");
		}
	});
});
