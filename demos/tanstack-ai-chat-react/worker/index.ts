import {
	createAnthropicChat,
	createAnthropicSummarize,
	createGeminiChat,
	createGeminiImage,
	createGeminiSummarize,
	createGrokChat,
	createGrokImage,
	createOpenAiChat,
	createOpenAiImage,
	createOpenAiSummarize,
	createWorkersAiChat,
	type WorkersAiTextModel,
} from "@cloudflare/tanstack-ai";
import type { AnyImageAdapter, AnySummarizeAdapter, AnyTextAdapter } from "@tanstack/ai";
import { chat, generateImage, summarize, toHttpResponse, toolDefinition } from "@tanstack/ai";
import { env } from "cloudflare:workers";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Credential extraction from request headers
// ---------------------------------------------------------------------------

interface CloudflareCredentials {
	accountId: string;
	gatewayId: string;
	apiToken: string;
}

interface ProviderKeys {
	openai?: string;
	anthropic?: string;
	gemini?: string;
	grok?: string;
}

interface RequestCredentials {
	/** When true, use env.AI / env.AI.gateway() bindings directly */
	useBinding: boolean;
	cloudflare: CloudflareCredentials | null;
	/** Gateway ID (available in both modes, used for env.AI.gateway(id) in binding mode) */
	gatewayId?: string;
	providerKeys: ProviderKeys;
	/** Optional Workers AI model override from the frontend model selector */
	workersAiModel?: string;
}

function extractCredentials(request: Request): RequestCredentials {
	const useBinding = request.headers.get("X-Use-Binding") === "true";
	const accountId = request.headers.get("X-CF-Account-Id");
	const gatewayId = request.headers.get("X-CF-Gateway-Id");
	const apiToken = request.headers.get("X-CF-Api-Token");

	return {
		useBinding,
		// In binding mode, gatewayId can come alone (for env.AI.gateway(id))
		cloudflare:
			!useBinding && accountId && gatewayId && apiToken
				? { accountId, gatewayId, apiToken }
				: null,
		// Gateway ID is available separately for binding mode
		gatewayId: gatewayId || undefined,
		providerKeys: {
			openai: request.headers.get("X-OpenAI-Api-Key") || undefined,
			anthropic: request.headers.get("X-Anthropic-Api-Key") || undefined,
			gemini: request.headers.get("X-Gemini-Api-Key") || undefined,
			grok: request.headers.get("X-Grok-Api-Key") || undefined,
		},
		workersAiModel: request.headers.get("X-Workers-AI-Model") || undefined,
	};
}

/**
 * Build AI Gateway REST credentials config.
 * Prefers user-provided headers, falls back to environment variables.
 * Optionally injects the provider API key.
 */
function gwRestConfig(creds: RequestCredentials, providerApiKey?: string) {
	const base = creds.cloudflare
		? {
				gatewayId: creds.cloudflare.gatewayId,
				accountId: creds.cloudflare.accountId,
				cfApiKey: creds.cloudflare.apiToken,
			}
		: {
				gatewayId: env.CLOUDFLARE_AI_GATEWAY_ID,
				accountId: env.CLOUDFLARE_ACCOUNT_ID,
				cfApiKey: env.CLOUDFLARE_API_TOKEN,
			};

	return providerApiKey ? { ...base, apiKey: providerApiKey } : base;
}

/**
 * Build AI Gateway binding config using env.AI.gateway().
 * Uses the user-provided gateway ID or falls back to the env var.
 * Optionally injects the provider API key.
 */
function resolveGatewayId(creds: RequestCredentials): string {
	return creds.gatewayId || env.CLOUDFLARE_AI_GATEWAY_ID || "default";
}

function gwBindingConfig(creds: RequestCredentials, providerApiKey?: string) {
	const base = { binding: env.AI.gateway(resolveGatewayId(creds)) };
	return providerApiKey ? { ...base, apiKey: providerApiKey } : base;
}

// ---------------------------------------------------------------------------
// Dynamic adapter factories (credentials-aware)
// ---------------------------------------------------------------------------

/** Default model per Workers AI route (used when no override header is provided) */
const DEFAULT_WORKERS_AI_MODELS: Record<string, string> = {
	"/ai/workers-ai-plain": "@cf/moonshotai/kimi-k2.5",
	"/ai/workers-ai": "@cf/qwen/qwen3-30b-a3b-fp8",
};

function getChatAdapter(path: string, creds: RequestCredentials): AnyTextAdapter | null {
	const pk = creds.providerKeys;
	// Allow frontend to override the Workers AI model via header
	const waiModel = (creds.workersAiModel ||
		DEFAULT_WORKERS_AI_MODELS[path] ||
		"@cf/moonshotai/kimi-k2.5") as WorkersAiTextModel;

	if (creds.useBinding) {
		// Binding mode: use env.AI / env.AI.gateway() directly
		switch (path) {
			case "/ai/openai":
				return createOpenAiChat("gpt-5.2", gwBindingConfig(creds, pk.openai));
			case "/ai/anthropic":
				return createAnthropicChat("claude-opus-4-6", gwBindingConfig(creds, pk.anthropic));
			case "/ai/gemini":
				// Gemini SDK can't use binding (no fetch override) — fall back to REST via env vars
				return createGeminiChat("gemini-3-flash-preview", gwRestConfig(creds, pk.gemini));
			case "/ai/grok":
				return createGrokChat("grok-4-1-fast-reasoning", gwBindingConfig(creds, pk.grok));
			case "/ai/workers-ai":
				return createWorkersAiChat(waiModel, {
					binding: env.AI.gateway(resolveGatewayId(creds)),
					apiKey: env.CLOUDFLARE_API_TOKEN,
				});
			case "/ai/workers-ai-plain":
				return createWorkersAiChat(waiModel, { binding: env.AI });
			default:
				return null;
		}
	}

	// REST mode: use credentials from UI or env vars
	switch (path) {
		case "/ai/openai":
			return createOpenAiChat("gpt-5.2", gwRestConfig(creds, pk.openai));
		case "/ai/anthropic":
			return createAnthropicChat("claude-opus-4-6", gwRestConfig(creds, pk.anthropic));
		case "/ai/gemini":
			return createGeminiChat("gemini-3-flash-preview", gwRestConfig(creds, pk.gemini));
		case "/ai/grok":
			return createGrokChat("grok-4-1-fast-reasoning", gwRestConfig(creds, pk.grok));
		case "/ai/workers-ai":
			return creds.cloudflare
				? createWorkersAiChat(waiModel, {
						...gwRestConfig(creds),
						apiKey: creds.cloudflare.apiToken,
					})
				: createWorkersAiChat(waiModel, {
						binding: env.AI.gateway(resolveGatewayId(creds)),
						apiKey: env.CLOUDFLARE_API_TOKEN,
					});
		case "/ai/workers-ai-plain":
			return creds.cloudflare
				? createWorkersAiChat(waiModel, {
						accountId: creds.cloudflare.accountId,
						apiKey: creds.cloudflare.apiToken,
					})
				: createWorkersAiChat(waiModel, { binding: env.AI });
		default:
			return null;
	}
}

function getImageAdapter(path: string, creds: RequestCredentials): AnyImageAdapter | null {
	const pk = creds.providerKeys;

	if (creds.useBinding) {
		switch (path) {
			case "/ai/image/openai":
				return createOpenAiImage("gpt-image-1", gwBindingConfig(creds, pk.openai));
			case "/ai/image/gemini":
				// Gemini SDK can't use binding — fall back to REST via env vars
				return createGeminiImage(
					"gemini-3-pro-image-preview",
					gwRestConfig(creds, pk.gemini),
				);
			case "/ai/image/grok":
				return createGrokImage("grok-2-image-1212", gwBindingConfig(creds, pk.grok));
			default:
				return null;
		}
	}

	switch (path) {
		case "/ai/image/openai":
			return createOpenAiImage("gpt-image-1", gwRestConfig(creds, pk.openai));
		case "/ai/image/gemini":
			return createGeminiImage("gemini-3-pro-image-preview", gwRestConfig(creds, pk.gemini));
		case "/ai/image/grok":
			return createGrokImage("grok-2-image-1212", gwRestConfig(creds, pk.grok));
		default:
			return null;
	}
}

function getSummarizeAdapter(path: string, creds: RequestCredentials): AnySummarizeAdapter | null {
	const pk = creds.providerKeys;

	if (creds.useBinding) {
		switch (path) {
			case "/ai/summarize/openai":
				return createOpenAiSummarize("gpt-5.2", gwBindingConfig(creds, pk.openai));
			case "/ai/summarize/anthropic":
				return createAnthropicSummarize(
					"claude-opus-4-6",
					gwBindingConfig(creds, pk.anthropic),
				);
			case "/ai/summarize/gemini":
				// Gemini SDK can't use binding — fall back to REST via env vars
				return createGeminiSummarize("gemini-2.0-flash", gwRestConfig(creds, pk.gemini));
			default:
				return null;
		}
	}

	switch (path) {
		case "/ai/summarize/openai":
			return createOpenAiSummarize("gpt-5.2", gwRestConfig(creds, pk.openai));
		case "/ai/summarize/anthropic":
			return createAnthropicSummarize("claude-opus-4-6", gwRestConfig(creds, pk.anthropic));
		case "/ai/summarize/gemini":
			return createGeminiSummarize("gemini-2.0-flash", gwRestConfig(creds, pk.gemini));
		default:
			return null;
	}
}

// ---------------------------------------------------------------------------
// Route lists (for the /ai/models discovery endpoint)
// ---------------------------------------------------------------------------

const CHAT_PATHS = ["openai", "anthropic", "gemini", "grok", "workers-ai", "workers-ai-plain"];
const IMAGE_PATHS = ["openai", "gemini", "grok"];
const SUMMARIZE_PATHS = ["openai", "anthropic", "gemini"];

// ---------------------------------------------------------------------------
// Tools (for chat)
// ---------------------------------------------------------------------------

const tools = [
	toolDefinition({
		name: "sum",
		description: "Sum of two numbers",
		inputSchema: z.object({ a: z.number(), b: z.number() }),
	}).server((args) => ({ result: args.a + args.b })),
	toolDefinition({
		name: "multiply",
		description: "Multiply two numbers",
		inputSchema: z.object({ a: z.number(), b: z.number() }),
	}).server((args) => ({ result: args.a * args.b })),
	toolDefinition({
		name: "get_current_time",
		description: "Get the current UTC time",
		inputSchema: z.object({}),
	}).server(() => ({ time: new Date().toISOString() })),
	toolDefinition({
		name: "random_number",
		description: "Generate a random number between min and max",
		inputSchema: z.object({ min: z.number(), max: z.number() }),
	}).server((args) => ({
		result: Math.floor(Math.random() * (args.max - args.min + 1)) + args.min,
	})),
	toolDefinition({
		name: "reverse_string",
		description: "Reverse a string",
		inputSchema: z.object({ text: z.string() }),
	}).server((args) => ({
		reversed: args.text.split("").reverse().join(""),
	})),
	toolDefinition({
		name: "web_scrape",
		description:
			"Fetch and extract text content from a webpage URL. Only works with public HTTP/HTTPS URLs.",
		inputSchema: z.object({ url: z.string().url() }),
	}).server(async (args) => {
		try {
			// Only allow http(s) URLs to prevent SSRF against internal services
			const parsed = new URL(args.url);
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				return { url: args.url, error: "Only http and https URLs are allowed" };
			}
			// Block private/internal IPs (cloud metadata, localhost, RFC1918)
			const hostname = parsed.hostname.toLowerCase();
			if (
				hostname === "localhost" ||
				hostname.startsWith("127.") ||
				hostname.startsWith("10.") ||
				hostname.startsWith("192.168.") ||
				hostname === "169.254.169.254" ||
				hostname.startsWith("172.") ||
				hostname === "[::1]" ||
				hostname === "0.0.0.0"
			) {
				return { url: args.url, error: "Private/internal URLs are not allowed" };
			}
			const response = await fetch(args.url);
			const html = await response.text();
			const text = html
				.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
				.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
				.replace(/<[^>]+>/g, " ")
				.replace(/\s+/g, " ")
				.trim()
				.slice(0, 5000);
			return { url: args.url, content: text };
		} catch (error) {
			return { url: args.url, error: String(error) };
		}
	}),
];

// ---------------------------------------------------------------------------
// Worker fetch handler
// ---------------------------------------------------------------------------

export default {
	async fetch(request) {
		const url = new URL(request.url);

		// Discovery endpoint
		if (url.pathname === "/ai/models") {
			return Response.json({
				chat: CHAT_PATHS,
				image: IMAGE_PATHS,
				summarize: SUMMARIZE_PATHS,
			});
		}

		if (request.method !== "POST") {
			if (url.pathname.startsWith("/ai/")) {
				return new Response("Method not allowed", { status: 405 });
			}
			return new Response(null, { status: 404 });
		}

		const creds = extractCredentials(request);

		// --- Chat ---
		const chatAdapter = getChatAdapter(url.pathname, creds);
		if (chatAdapter) {
			try {
				const body = (await request.json()) as {
					messages: unknown[];
					data: { conversationId?: string };
				};

				const response = chat({
					adapter: chatAdapter,
					stream: true,
					conversationId: body.data?.conversationId ?? crypto.randomUUID(),
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					messages: body.messages as any,
					temperature: 0.6,
					tools,
				});

				return toHttpResponse(response);
			} catch (error) {
				return Response.json(
					{ error: error instanceof Error ? error.message : String(error) },
					{ status: 500 },
				);
			}
		}

		// --- Image generation ---
		const imageAdapter = getImageAdapter(url.pathname, creds);
		if (imageAdapter) {
			try {
				const { prompt } = (await request.json()) as { prompt: string };
				if (!prompt?.trim()) {
					return Response.json({ error: "prompt is required" }, { status: 400 });
				}

				const result = await generateImage({ adapter: imageAdapter, prompt });
				return Response.json(result);
			} catch (error) {
				return Response.json(
					{
						error: error instanceof Error ? error.message : String(error),
					},
					{ status: 500 },
				);
			}
		}

		// --- Summarization ---
		const summarizeAdapter = getSummarizeAdapter(url.pathname, creds);
		if (summarizeAdapter) {
			try {
				const { text } = (await request.json()) as { text: string };
				if (!text?.trim()) {
					return Response.json({ error: "text is required" }, { status: 400 });
				}

				const result = await summarize({
					adapter: summarizeAdapter,
					text,
				});
				return Response.json(result);
			} catch (error) {
				return Response.json(
					{
						error: error instanceof Error ? error.message : String(error),
					},
					{ status: 500 },
				);
			}
		}

		return new Response(null, { status: 404 });
	},
} satisfies ExportedHandler<Env>;
