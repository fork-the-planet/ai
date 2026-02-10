// Adapter factory functions
export { createAnthropicChat, createAnthropicSummarize } from "./adapters/anthropic";
export type { AnthropicGatewayConfig } from "./adapters/anthropic";
export { ANTHROPIC_MODELS, type AnthropicChatModel } from "./adapters/anthropic";

export {
	createGeminiChat,
	createGeminiImage,
	createGeminiSummarize,
} from "./adapters/gemini";
export type { GeminiGatewayConfig } from "./adapters/gemini";
export {
	GeminiTextModels,
	GeminiImageModels,
	GeminiSummarizeModels,
	type GeminiChatModel,
	type GeminiTextModel,
	type GeminiImageModel,
	type GeminiSummarizeModel,
} from "./adapters/gemini";

export { createGrokChat, createGrokImage, createGrokSummarize } from "./adapters/grok";
export type { GrokGatewayConfig } from "./adapters/grok";
export {
	GROK_CHAT_MODELS,
	GROK_IMAGE_MODELS,
	type GrokChatModel,
	type GrokImageModel,
	type GrokSummarizeModel,
} from "./adapters/grok";

export {
	createOpenAiChat,
	createOpenAiImage,
	createOpenAiSummarize,
	createOpenAiTranscription,
	createOpenAiTts,
	createOpenAiVideo,
} from "./adapters/openai";
export type { OpenAiGatewayConfig } from "./adapters/openai";
export {
	OPENAI_CHAT_MODELS,
	OPENAI_IMAGE_MODELS,
	OPENAI_TRANSCRIPTION_MODELS,
	OPENAI_TTS_MODELS,
	OPENAI_VIDEO_MODELS,
	type OpenAIChatModel,
	type OpenAIImageModel,
	type OpenAITranscriptionModel,
	type OpenAITTSModel,
	type OpenAIVideoModel,
} from "./adapters/openai";

export { createWorkersAiChat } from "./adapters/workers-ai";
export type { WorkersAiTextModel } from "./adapters/workers-ai";

// TODO: Workers AI image generation adapter is implemented in workers-ai-image.ts.
// Needs rewrite to extend BaseImageAdapter (now available in @tanstack/ai 0.4.2).

// Config types
export type {
	AiGatewayAdapterConfig,
	WorkersAiAdapterConfig,
} from "./utils/create-fetcher";
