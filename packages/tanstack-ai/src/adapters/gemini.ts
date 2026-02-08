import { GoogleGenAI } from "@google/genai";
import {
	GeminiTextAdapter,
	GeminiImageAdapter,
	GeminiSummarizeAdapter,
	type GeminiTextModels,
	type GeminiImageModels,
	type GeminiSummarizeModels,
} from "@tanstack/ai-gemini";
import type { AiGatewayCredentialsConfig } from "../utils/create-fetcher";

/** Gemini-specific gateway config (credentials only, no binding support). */
export type GeminiGatewayConfig = AiGatewayCredentialsConfig;

function createGeminiClient(config: GeminiGatewayConfig) {
	return new GoogleGenAI({
		apiKey: config.apiKey ?? "unused",
		httpOptions: {
			baseUrl: `https://gateway.ai.cloudflare.com/v1/${config.accountId}/${config.gatewayId}/google-ai-studio`,
			headers: config.cfApiKey
				? {
						"cf-aig-authorization": `Bearer ${config.cfApiKey}`,
					}
				: undefined,
		},
	});
}

type GeminiChatModel = (typeof GeminiTextModels)[number];

// Internal subclass: overrides the GoogleGenAI client to route through AI Gateway.
// TODO: File upstream issue on @tanstack/ai-gemini to support client injection
// so we can avoid this @ts-expect-error pattern.
class GeminiTextGatewayAdapter<TModel extends GeminiChatModel> extends GeminiTextAdapter<TModel> {
	constructor(model: TModel, config: GeminiGatewayConfig) {
		super({ apiKey: config.apiKey ?? "unused" }, model);

		// @ts-expect-error - TanStack's GeminiTextAdapter doesn't expose client injection
		this.client = createGeminiClient(config);
	}
}

/**
 * Creates a Gemini adapter which uses Cloudflare AI Gateway.
 * Does not support the AI binding (Google GenAI SDK lacks custom fetch support).
 * @param model The Gemini model to use
 * @param config Configuration options (credentials only)
 */
export function createGeminiChat(model: GeminiChatModel, config: GeminiGatewayConfig) {
	return new GeminiTextGatewayAdapter(model, config);
}

type GeminiImageModel = (typeof GeminiImageModels)[number];

class GeminiImageGatewayAdapter<
	TModel extends GeminiImageModel,
> extends GeminiImageAdapter<TModel> {
	constructor(model: TModel, config: GeminiGatewayConfig) {
		super({ apiKey: config.apiKey ?? "unused" }, model);

		// @ts-expect-error - TanStack's GeminiImageAdapter doesn't expose client injection
		this.client = createGeminiClient(config);
	}
}

/**
 * Creates a Gemini Image adapter which uses Cloudflare AI Gateway.
 * Does not support the AI binding (Google GenAI SDK lacks custom fetch support).
 * @param model The Gemini model to use
 * @param config Configuration options (credentials only)
 */
export function createGeminiImage(model: GeminiImageModel, config: GeminiGatewayConfig) {
	return new GeminiImageGatewayAdapter(model, config);
}

type GeminiSummarizeModel = (typeof GeminiSummarizeModels)[number];

class GeminiSummarizeGatewayAdapter<
	TModel extends GeminiSummarizeModel,
> extends GeminiSummarizeAdapter<TModel> {
	constructor(model: TModel, config: GeminiGatewayConfig) {
		const client = createGeminiClient(config);
		super(client, model);
	}
}

/**
 * Creates a Gemini Summarize adapter which uses Cloudflare AI Gateway.
 * Does not support the AI binding (Google GenAI SDK lacks custom fetch support).
 * @param model The Gemini model to use
 * @param config Configuration options (credentials only)
 */
export function createGeminiSummarize(model: GeminiSummarizeModel, config: GeminiGatewayConfig) {
	return new GeminiSummarizeGatewayAdapter(model, config);
}
