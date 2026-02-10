import { defineConfig } from "tsup";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/adapters/anthropic.ts",
		"src/adapters/gemini.ts",
		"src/adapters/grok.ts",
		"src/adapters/openai.ts",
		"src/adapters/workers-ai.ts",
	],
	splitting: true,
	sourcemap: true,
	clean: true,
	experimentalDts: true,
	format: ["cjs", "esm"],
	skipNodeModulesBundle: true,
	target: "es2020",
});
