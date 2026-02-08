import { defineConfig } from "tsup";
import pkg from "./package.json";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/adapters/anthropic.ts",
		"src/adapters/gemini.ts",
		"src/adapters/grok.ts",
		"src/adapters/openai.ts",
		"src/adapters/workers-ai.ts",
		// workers-ai-embedding.ts and workers-ai-image.ts are intentionally excluded
		// until TanStack AI adds BaseEmbeddingAdapter / BaseImageAdapter.
	],
	splitting: false,
	sourcemap: true,
	clean: true,
	dts: true,
	format: ["cjs", "esm"],
	external: Object.keys(pkg.optionalDependencies ?? {}),
	target: "es2020",
});
