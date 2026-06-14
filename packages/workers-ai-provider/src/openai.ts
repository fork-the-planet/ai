import { createOpenAI } from "@ai-sdk/openai";
import type { ProviderPlugin } from "./gateway-delegate";

/**
 * OpenAI provider plugin for the gateway delegate. Pass to
 * `createGatewayDelegate({ providers: [openai] })` to handle `"openai/<model>"`
 * slugs.
 *
 * Requires `@ai-sdk/openai` (an optional peer dependency — install it yourself).
 *
 * Uses `.chat()` (Chat Completions) deliberately: AI SDK v6's bare `openai()`
 * defaults to the Responses API, which the AI Gateway run catalog does not serve.
 */
export const openai: ProviderPlugin = {
	resolverKey: "openai",
	create: ({ modelId, fetch }) =>
		// apiKey is a placeholder — the gateway handles auth (unified billing / BYOK)
		// and the delegate strips the Authorization header on the gateway path.
		createOpenAI({ apiKey: "unused", fetch }).chat(modelId),
};
