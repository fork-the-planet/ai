import {
	GrokTextAdapter,
	GrokImageAdapter,
	type GROK_CHAT_MODELS,
	type GROK_IMAGE_MODELS,
} from "@tanstack/ai-grok";
import { createGatewayFetch, type AiGatewayAdapterConfig } from "../utils/create-fetcher";

type GrokAiModel = (typeof GROK_CHAT_MODELS)[number];
type GrokAiImageModel = (typeof GROK_IMAGE_MODELS)[number];

/**
 * Builds a Grok-compatible config that injects the gateway fetch.
 * Grok uses the OpenAI SDK internally, which supports a `fetch` parameter via ClientOptions.
 */
function buildGrokConfig(config: AiGatewayAdapterConfig) {
	return {
		apiKey: config.apiKey ?? "unused",
		fetch: createGatewayFetch("grok", config),
	};
}

/**
 * Creates a Grok chat adapter which uses Cloudflare AI Gateway.
 * Supports both binding and credential-based configurations.
 * @param model The Grok model to use
 * @param config Configuration options
 */
export function createGrokChat(model: GrokAiModel, config: AiGatewayAdapterConfig) {
	return new GrokTextAdapter(buildGrokConfig(config), model);
}

/**
 * Creates a Grok image adapter which uses Cloudflare AI Gateway.
 * Supports both binding and credential-based configurations.
 * @param model The Grok image model to use
 * @param config Configuration options
 */
export function createGrokImage(model: GrokAiImageModel, config: AiGatewayAdapterConfig) {
	return new GrokImageAdapter(buildGrokConfig(config), model);
}
