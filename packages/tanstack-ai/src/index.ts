// Adapter factory functions
export { createAnthropicChat, createAnthropicSummarize } from "./adapters/anthropic";
export type { AnthropicGatewayConfig } from "./adapters/anthropic";

export {
	createGeminiChat,
	createGeminiImage,
	createGeminiSummarize,
} from "./adapters/gemini";
export type { GeminiGatewayConfig } from "./adapters/gemini";

export { createGrokChat, createGrokImage } from "./adapters/grok";

export {
	createOpenAiChat,
	createOpenAiImage,
	createOpenAiSummarize,
	createOpenAiTranscription,
	createOpenAiTts,
	createOpenAiVideo,
} from "./adapters/openai";

export { createWorkersAiChat } from "./adapters/workers-ai";
export type { WorkersAiTextModel } from "./adapters/workers-ai";

// TODO: Export embeddings and image generation once TanStack AI adds
// BaseEmbeddingAdapter / BaseImageAdapter. The adapters are implemented
// in workers-ai-embedding.ts and workers-ai-image.ts, ready to ship.

// Config types
export type {
	AiGatewayAdapterConfig,
	WorkersAiAdapterConfig,
} from "./utils/create-fetcher";
