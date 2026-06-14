import { createAnthropic } from "@ai-sdk/anthropic";
import type { ProviderPlugin } from "./gateway-delegate";

/**
 * Anthropic provider plugin for the gateway delegate. Pass to
 * `createGatewayDelegate({ providers: [anthropic] })` to handle
 * `"anthropic/<model>"` slugs.
 *
 * Requires `@ai-sdk/anthropic` (an optional peer dependency — install it yourself).
 */
export const anthropic: ProviderPlugin = {
	resolverKey: "anthropic",
	create: ({ modelId, fetch }) =>
		// apiKey is a placeholder — the gateway handles auth (unified billing / BYOK)
		// and the delegate strips the x-api-key header on the gateway path.
		createAnthropic({ apiKey: "unused", fetch })(modelId),
};
