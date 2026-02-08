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

interface UserCredentials {
	accountId: string;
	gatewayId: string;
	apiToken: string;
}

function getCredentials(request: Request): UserCredentials | null {
	const accountId = request.headers.get("X-CF-Account-Id");
	const gatewayId = request.headers.get("X-CF-Gateway-Id");
	const apiToken = request.headers.get("X-CF-Api-Token");
	if (accountId && gatewayId && apiToken) {
		return { accountId, gatewayId, apiToken };
	}
	return null;
}

/**
 * Build AI Gateway credentials config.
 * Prefers user-provided headers, falls back to environment variables.
 */
function gwConfig(creds: UserCredentials | null) {
	if (creds) {
		return {
			gatewayId: creds.gatewayId,
			accountId: creds.accountId,
			cfApiKey: creds.apiToken,
		};
	}
	return {
		gatewayId: env.CLOUDFLARE_AI_GATEWAY_ID,
		accountId: env.CLOUDFLARE_ACCOUNT_ID,
		cfApiKey: env.CLOUDFLARE_API_TOKEN,
	};
}

// ---------------------------------------------------------------------------
// Dynamic adapter factories (credentials-aware)
// ---------------------------------------------------------------------------

function getChatAdapter(path: string, creds: UserCredentials | null): AnyTextAdapter | null {
	const gw = gwConfig(creds);
	switch (path) {
		case "/ai/openai":
			return createOpenAiChat("gpt-5.2", gw);
		case "/ai/anthropic":
			// Anthropic: use credentials when user-provided, binding when env-configured
			return creds
				? createAnthropicChat("claude-sonnet-4-5", gw)
				: createAnthropicChat("claude-sonnet-4-5", {
						binding: env.AI.gateway(env.CLOUDFLARE_AI_GATEWAY_ID),
					});
		case "/ai/gemini":
			return createGeminiChat("gemini-2.5-flash", gw);
		case "/ai/grok":
			return createGrokChat("grok-4-1-fast-reasoning", gw);
		case "/ai/workers-ai":
			// Workers AI via Gateway: credentials → REST gateway, env → binding gateway
			return creds
				? createWorkersAiChat("@cf/qwen/qwen3-30b-a3b-fp8" as WorkersAiTextModel, {
						...gw,
						apiKey: creds.apiToken,
					})
				: createWorkersAiChat("@cf/qwen/qwen3-30b-a3b-fp8" as WorkersAiTextModel, {
						binding: env.AI.gateway(env.CLOUDFLARE_AI_GATEWAY_ID),
						apiKey: env.CLOUDFLARE_API_TOKEN,
					});
		case "/ai/workers-ai-plain":
			// Plain Workers AI: credentials → REST API, env → binding
			return creds
				? createWorkersAiChat(
						"@cf/meta/llama-4-scout-17b-16e-instruct" as WorkersAiTextModel,
						{ accountId: creds.accountId, apiKey: creds.apiToken },
					)
				: createWorkersAiChat(
						"@cf/meta/llama-4-scout-17b-16e-instruct" as WorkersAiTextModel,
						{ binding: env.AI },
					);
		default:
			return null;
	}
}

function getImageAdapter(path: string, creds: UserCredentials | null): AnyImageAdapter | null {
	const gw = gwConfig(creds);
	switch (path) {
		case "/ai/image/openai":
			return createOpenAiImage("gpt-image-1", gw);
		case "/ai/image/gemini":
			return createGeminiImage("imagen-4.0-generate-001", gw);
		case "/ai/image/grok":
			return createGrokImage("grok-2-image-1212", gw);
		default:
			return null;
	}
}

function getSummarizeAdapter(
	path: string,
	creds: UserCredentials | null,
): AnySummarizeAdapter | null {
	const gw = gwConfig(creds);
	switch (path) {
		case "/ai/summarize/openai":
			return createOpenAiSummarize("gpt-5.2", gw);
		case "/ai/summarize/anthropic":
			return creds
				? createAnthropicSummarize("claude-sonnet-4-5", gw)
				: createAnthropicSummarize("claude-sonnet-4-5", {
						binding: env.AI.gateway(env.CLOUDFLARE_AI_GATEWAY_ID),
					});
		case "/ai/summarize/gemini":
			return createGeminiSummarize("gemini-2.0-flash", gw);
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
		description: "Fetch and extract text content from a webpage URL",
		inputSchema: z.object({ url: z.string().url() }),
	}).server(async (args) => {
		try {
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

		const creds = getCredentials(request);

		// --- Chat ---
		const chatAdapter = getChatAdapter(url.pathname, creds);
		if (chatAdapter) {
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
