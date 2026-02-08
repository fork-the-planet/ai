import { AnthropicTextAdapter, AnthropicSummarizeAdapter } from "@tanstack/ai-anthropic";
import AnthropicSdk from "@anthropic-ai/sdk";
import { createGatewayFetch, type AiGatewayAdapterConfig } from "../utils/create-fetcher";

export type AnthropicGatewayConfig = AiGatewayAdapterConfig & { anthropicVersion?: string };

function createAnthropicClient(config: AnthropicGatewayConfig) {
	return new AnthropicSdk({
		apiKey: config.apiKey ?? "unused",
		fetch: createGatewayFetch("anthropic", config, {
			"anthropic-version": config.anthropicVersion ?? "2023-06-01",
		}),
	});
}

const ANTHROPIC_MODELS = [
	"claude-opus-4-5",
	"claude-sonnet-4-5",
	"claude-haiku-4-5",
	"claude-opus-4-1",
	"claude-sonnet-4",
	"claude-3-7-sonnet",
	"claude-opus-4",
	"claude-3-5-haiku",
	"claude-3-haiku",
] as const;

type AnthropicModel = (typeof ANTHROPIC_MODELS)[number];

/**
 * Creates an Anthropic chat adapter which uses Cloudflare AI Gateway.
 * Supports both binding and credential-based configurations.
 * @param model The Anthropic model to use
 * @param config Configuration options
 */
export function createAnthropicChat(model: AnthropicModel, config: AnthropicGatewayConfig) {
	return new AnthropicTextGatewayAdapter(model, config);
}

/**
 * Creates an Anthropic summarize adapter which uses Cloudflare AI Gateway.
 * Supports both binding and credential-based configurations.
 * @param model The Anthropic model to use
 * @param config Configuration options
 */
export function createAnthropicSummarize(model: AnthropicModel, config: AnthropicGatewayConfig) {
	return new AnthropicSummarizeGatewayAdapter(model, config);
}

// Internal subclasses: override the Anthropic SDK client to route through AI Gateway.
// TODO: File upstream issue on @tanstack/ai-anthropic to support client/fetch injection
// so we can avoid this @ts-expect-error pattern.
class AnthropicTextGatewayAdapter<
	TModel extends AnthropicModel,
> extends AnthropicTextAdapter<TModel> {
	constructor(model: TModel, config: AnthropicGatewayConfig) {
		super(config, model);

		// @ts-expect-error - TanStack's AnthropicTextAdapter doesn't expose client injection
		this.client = createAnthropicClient(config);
	}
}

class AnthropicSummarizeGatewayAdapter<
	TModel extends AnthropicModel,
> extends AnthropicSummarizeAdapter<TModel> {
	constructor(model: TModel, config: AnthropicGatewayConfig) {
		super(config, model);

		// @ts-expect-error - TanStack's AnthropicSummarizeAdapter doesn't expose client injection
		this.client = createAnthropicClient(config);
	}
}
