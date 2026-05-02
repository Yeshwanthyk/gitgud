import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import unusedImports from "eslint-plugin-unused-imports";

export default [
	{
		files: ["src/**/*.ts"],
		ignores: ["dist/**", "node_modules/**"],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			"@typescript-eslint": tseslint,
			"unused-imports": unusedImports,
		},
		rules: {
			"@typescript-eslint/no-unsafe-argument": "error",
			"@typescript-eslint/no-unsafe-assignment": "error",
			"@typescript-eslint/no-unsafe-call": "error",
			"@typescript-eslint/no-unsafe-member-access": "error",
			"@typescript-eslint/no-unsafe-return": "error",

			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/no-misused-promises": [
				"error",
				{ checksVoidReturn: { attributes: false } },
			],
			"@typescript-eslint/return-await": ["error", "in-try-catch"],

			"@typescript-eslint/prefer-nullish-coalescing": "error",

			"unused-imports/no-unused-imports": "error",

			"prefer-const": "error",
		},
	},
];
