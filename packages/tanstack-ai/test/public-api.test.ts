import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Public API exports
// Mock unavailable optional dependencies so importing index.ts doesn't fail.
// These mocks are intentionally scoped to this file only.
// ---------------------------------------------------------------------------

vi.mock("@tanstack/ai/adapters", () => ({
	BaseTextAdapter: class {},
}));
vi.mock("@tanstack/ai", () => ({}));
vi.mock("@tanstack/ai-openai", () => ({
	OpenAITextAdapter: class {},
	OpenAISummarizeAdapter: class {},
	OpenAIImageAdapter: class {},
	OpenAITranscriptionAdapter: class {},
	OpenAITTSAdapter: class {},
	OpenAIVideoAdapter: class {},
	OPENAI_CHAT_MODELS: ["gpt-4o"],
	OPENAI_IMAGE_MODELS: ["dall-e-3"],
	OPENAI_TRANSCRIPTION_MODELS: ["whisper-1"],
	OPENAI_TTS_MODELS: ["tts-1"],
	OPENAI_VIDEO_MODELS: ["sora"],
}));
vi.mock("@tanstack/ai-anthropic", () => ({
	AnthropicTextAdapter: class {},
	AnthropicSummarizeAdapter: class {},
	ANTHROPIC_MODELS: ["claude-sonnet-4-5"],
}));
vi.mock("@tanstack/ai-gemini", () => ({
	GeminiTextAdapter: class {},
	GeminiSummarizeAdapter: class {},
	GeminiImageAdapter: class {},
	GeminiTextModels: ["gemini-2.5-flash"],
	GeminiImageModels: ["imagen-4.0-generate-001"],
	GeminiSummarizeModels: ["gemini-2.0-flash"],
}));
vi.mock("@tanstack/ai-grok", () => ({
	GrokTextAdapter: class {},
	GrokImageAdapter: class {},
	GrokSummarizeAdapter: class {},
	GROK_CHAT_MODELS: ["grok-3"],
	GROK_IMAGE_MODELS: ["grok-2-image-1212"],
}));
vi.mock("openai", () => ({ default: class {} }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class {} }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class {} }));

describe("public API exports", () => {
	it("should export factory functions from index", async () => {
		const exports = await import("../src/index");

		// Workers AI factory functions
		expect(typeof exports.createWorkersAiChat).toBe("function");

		// Embedding and image adapters are held back until TanStack AI adds base adapters
		expect((exports as any).createWorkersAiEmbedding).toBeUndefined();
		expect((exports as any).createWorkersAiImage).toBeUndefined();

		// Third-party factory functions
		expect(typeof exports.createOpenAiChat).toBe("function");
		expect(typeof exports.createAnthropicChat).toBe("function");
		expect(typeof exports.createGeminiChat).toBe("function");
		expect(typeof exports.createGrokChat).toBe("function");
		expect(typeof exports.createGrokSummarize).toBe("function");
	});

	it("should export config types (verified via factory functions)", async () => {
		const exports = await import("../src/index");

		// These types are verified by TypeScript at compile time;
		// at runtime we just ensure the module loaded cleanly.
		expect(exports).toBeDefined();
	});

	it("should NOT export internal config detection helpers", async () => {
		const exports = await import("../src/index");

		// These are internal implementation details
		expect((exports as any).isDirectBindingConfig).toBeUndefined();
		expect((exports as any).isDirectCredentialsConfig).toBeUndefined();
		expect((exports as any).isGatewayConfig).toBeUndefined();
		expect((exports as any).createWorkersAiBindingFetch).toBeUndefined();
		expect((exports as any).createGatewayFetch).toBeUndefined();
	});

	it("should export upstream model constants", async () => {
		const exports = await import("../src/index");

		// Anthropic
		expect(exports.ANTHROPIC_MODELS).toBeDefined();

		// OpenAI
		expect(exports.OPENAI_CHAT_MODELS).toBeDefined();
		expect(exports.OPENAI_IMAGE_MODELS).toBeDefined();

		// Gemini
		expect(exports.GeminiTextModels).toBeDefined();
		expect(exports.GeminiImageModels).toBeDefined();
		expect(exports.GeminiSummarizeModels).toBeDefined();

		// Grok
		expect(exports.GROK_CHAT_MODELS).toBeDefined();
		expect(exports.GROK_IMAGE_MODELS).toBeDefined();
	});

	it("should NOT export internal Gemini adapter classes", async () => {
		const exports = await import("../src/index");

		expect((exports as any).GeminiTextGatewayAdapter).toBeUndefined();
		expect((exports as any).GeminiImageGatewayAdapter).toBeUndefined();
		expect((exports as any).GeminiSummarizeGatewayAdapter).toBeUndefined();
	});
});
