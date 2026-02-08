import {
	OpenAIImageAdapter,
	OpenAISummarizeAdapter,
	OpenAITextAdapter,
	OpenAITranscriptionAdapter,
	OpenAITTSAdapter,
	OpenAIVideoAdapter,
	type OPENAI_CHAT_MODELS,
	type OPENAI_IMAGE_MODELS,
	type OPENAI_TRANSCRIPTION_MODELS,
	type OPENAI_TTS_MODELS,
	type OPENAI_VIDEO_MODELS,
} from "@tanstack/ai-openai";
import { createGatewayFetch, type AiGatewayAdapterConfig } from "../utils/create-fetcher";

type OpenAiModel = (typeof OPENAI_CHAT_MODELS)[number];
type OpenAiImageModel = (typeof OPENAI_IMAGE_MODELS)[number];
type OpenAiTranscriptionModel = (typeof OPENAI_TRANSCRIPTION_MODELS)[number];
type OpenAiTtsModel = (typeof OPENAI_TTS_MODELS)[number];
type OpenAiVideoModel = (typeof OPENAI_VIDEO_MODELS)[number];

/**
 * Builds an OpenAI-compatible config that injects the gateway fetch.
 * OpenAITextConfig extends OpenAI SDK's ClientOptions, which supports a `fetch` parameter.
 */
function buildOpenAiConfig(provider: string, config: AiGatewayAdapterConfig) {
	return {
		apiKey: config.apiKey ?? "unused",
		fetch: createGatewayFetch(provider, config),
	};
}

/**
 * Creates an OpenAI chat adapter which uses Cloudflare AI Gateway.
 * Supports both binding and credential-based configurations.
 * @param model The OpenAI model to use
 * @param config Configuration options
 */
export function createOpenAiChat(model: OpenAiModel, config: AiGatewayAdapterConfig) {
	return new OpenAITextAdapter(buildOpenAiConfig("openai", config), model);
}

/**
 * Creates an OpenAI summarize adapter which uses Cloudflare AI Gateway.
 * @param model The OpenAI model to use
 * @param config Configuration options
 */
export function createOpenAiSummarize(model: OpenAiModel, config: AiGatewayAdapterConfig) {
	return new OpenAISummarizeAdapter(buildOpenAiConfig("openai", config), model);
}

/**
 * Creates an OpenAI image adapter which uses Cloudflare AI Gateway.
 * @param model The OpenAI image model to use
 * @param config Configuration options
 */
export function createOpenAiImage(model: OpenAiImageModel, config: AiGatewayAdapterConfig) {
	return new OpenAIImageAdapter(buildOpenAiConfig("openai", config), model);
}

/**
 * Creates an OpenAI transcription adapter which uses Cloudflare AI Gateway.
 * @param model The OpenAI transcription model to use
 * @param config Configuration options
 */
export function createOpenAiTranscription(
	model: OpenAiTranscriptionModel,
	config: AiGatewayAdapterConfig,
) {
	return new OpenAITranscriptionAdapter(buildOpenAiConfig("openai", config), model);
}

/**
 * Creates an OpenAI TTS adapter which uses Cloudflare AI Gateway.
 * @param model The OpenAI TTS model to use
 * @param config Configuration options
 */
export function createOpenAiTts(model: OpenAiTtsModel, config: AiGatewayAdapterConfig) {
	return new OpenAITTSAdapter(buildOpenAiConfig("openai", config), model);
}

/**
 * Creates an OpenAI video adapter which uses Cloudflare AI Gateway.
 * @param model The OpenAI video model to use
 * @param config Configuration options
 */
export function createOpenAiVideo(model: OpenAiVideoModel, config: AiGatewayAdapterConfig) {
	return new OpenAIVideoAdapter(buildOpenAiConfig("openai", config), model);
}
