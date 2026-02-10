import {
	GeminiTextAdapter,
	GeminiImageAdapter,
	GeminiSummarizeAdapter,
	GeminiTextModels,
	GeminiImageModels,
	GeminiSummarizeModels,
	type GeminiTextModel,
	type GeminiImageModel,
	type GeminiSummarizeModel,
} from "@tanstack/ai-gemini";
import type { AnyTextAdapter } from "@tanstack/ai";
import type { AiGatewayCredentialsConfig } from "../utils/create-fetcher";

/** Gemini-specific gateway config (credentials only, no binding support). */
export type GeminiGatewayConfig = AiGatewayCredentialsConfig;

/**
 * Build Gemini client config that routes through AI Gateway.
 * Since GeminiClientConfig extends GoogleGenAIOptions, we can inject
 * httpOptions.baseUrl directly — no subclassing needed.
 *
 * The Google GenAI SDK doesn't support a custom `fetch` override,
 * so we set the baseUrl to the AI Gateway endpoint for Google AI Studio.
 */
function buildGeminiGatewayConfig(config: GeminiGatewayConfig) {
	return {
		apiKey: config.apiKey ?? "unused",
		httpOptions: {
			baseUrl: `https://gateway.ai.cloudflare.com/v1/${config.accountId}/${config.gatewayId}/google-ai-studio`,
			headers: config.cfApiKey
				? { "cf-aig-authorization": `Bearer ${config.cfApiKey}` }
				: undefined,
		},
	};
}

/** Alias for consistency with other providers (AnthropicChatModel, GrokChatModel, etc.) */
export type GeminiChatModel = GeminiTextModel;

/**
 * Creates a Gemini adapter which uses Cloudflare AI Gateway.
 * Does not support the AI binding (Google GenAI SDK lacks custom fetch support).
 * @param model The Gemini model to use
 * @param config Configuration options (credentials only)
 */
export function createGeminiChat(model: GeminiChatModel, config: GeminiGatewayConfig): AnyTextAdapter {
	return new GeminiTextAdapter(buildGeminiGatewayConfig(config), model);
}

/**
 * Creates a Gemini Image adapter which uses Cloudflare AI Gateway.
 * Does not support the AI binding (Google GenAI SDK lacks custom fetch support).
 * @param model The Gemini model to use
 * @param config Configuration options (credentials only)
 */
export function createGeminiImage(model: GeminiImageModel, config: GeminiGatewayConfig) {
	return new GeminiImageAdapter(buildGeminiGatewayConfig(config), model);
}

/**
 * Creates a Gemini Summarize adapter which uses Cloudflare AI Gateway.
 * Does not support the AI binding (Google GenAI SDK lacks custom fetch support).
 * @param model The Gemini model to use
 * @param config Configuration options (credentials only)
 */
export function createGeminiSummarize(
	model: GeminiSummarizeModel,
	config: GeminiGatewayConfig,
) {
	return new GeminiSummarizeAdapter(buildGeminiGatewayConfig(config), model);
}

export {
	GeminiTextModels,
	GeminiImageModels,
	GeminiSummarizeModels,
	type GeminiTextModel,
	type GeminiImageModel,
	type GeminiSummarizeModel,
};
