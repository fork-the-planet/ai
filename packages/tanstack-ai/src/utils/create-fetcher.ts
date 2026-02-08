// ---------------------------------------------------------------------------
// AI Gateway types (for third-party providers + Workers AI through gateway)
// ---------------------------------------------------------------------------

export interface CloudflareAiGateway {
	run(request: unknown): Promise<Response>;
}

export interface AiGatewayBindingConfig {
	/**
	 * The AI Gateway binding
	 * @example
	 * env.AI.gateway('my-gateway-id')
	 */
	binding: CloudflareAiGateway;
	/**
	 * The Provider API Key if you want to manually pass it, ignore if using Unified Billing or BYOK.
	 */
	apiKey?: string;
}

export interface AiGatewayCredentialsConfig {
	/**
	 * The Cloudflare account ID
	 */
	accountId: string;
	/**
	 * The AI Gateway ID
	 */
	gatewayId: string;
	/**
	 * The Provider API Key if you want to manually pass it, ignore if using Unified Billing or BYOK.
	 */
	apiKey?: string;
	/**
	 * The Cloudflare AI Gateway API Key, required if your Gateway is authenticated.
	 */
	cfApiKey?: string;
}

export interface AiGatewayConfig {
	skipCache?: boolean;
	cacheTtl?: number;
	customCacheKey?: string;
	metadata?: Record<string, unknown>;
}

export type AiGatewayAdapterConfig = (AiGatewayBindingConfig | AiGatewayCredentialsConfig) &
	AiGatewayConfig;

// ---------------------------------------------------------------------------
// Plain Workers AI types (direct binding or REST, no gateway)
// ---------------------------------------------------------------------------

/**
 * The Workers AI binding interface (env.AI).
 * Accepts a model name and inputs, returns results directly.
 * Includes `gateway()` which is present on `env.AI` but not on `env.AI.gateway(id)`,
 * enabling structural discrimination from `CloudflareAiGateway`.
 */
export interface WorkersAiBinding {
	run(
		model: string,
		inputs: Record<string, unknown>,
		options?: Record<string, unknown>,
	): Promise<unknown>;
	gateway(gatewayId: string): CloudflareAiGateway;
}

export interface WorkersAiDirectBindingConfig {
	/**
	 * The Workers AI binding (env.AI).
	 * @example
	 * { binding: env.AI }
	 */
	binding: WorkersAiBinding;
}

export interface WorkersAiDirectCredentialsConfig {
	/**
	 * The Cloudflare account ID
	 */
	accountId: string;
	/**
	 * The Cloudflare API key for Workers AI
	 */
	apiKey: string;
}

/**
 * Config for Workers AI adapters. Supports four modes:
 * - Plain binding: `{ binding: env.AI }`
 * - Plain REST: `{ accountId, apiKey }`
 * - AI Gateway binding: `{ binding: env.AI.gateway(id) }`
 * - AI Gateway REST: `{ accountId, gatewayId, ... }`
 */
export type WorkersAiAdapterConfig =
	| WorkersAiDirectBindingConfig
	| WorkersAiDirectCredentialsConfig
	| (AiGatewayAdapterConfig & { apiKey?: string });

// ---------------------------------------------------------------------------
// Config detection helpers
// ---------------------------------------------------------------------------

/** Returns true if this is a plain Workers AI binding config (`{ binding: env.AI }`) */
export function isDirectBindingConfig(
	config: WorkersAiAdapterConfig,
): config is WorkersAiDirectBindingConfig {
	// env.AI has a .gateway() method; env.AI.gateway(id) does not.
	// This distinguishes direct bindings from AI Gateway bindings.
	return (
		"binding" in config &&
		typeof (config.binding as unknown as Record<string, unknown>).gateway === "function"
	);
}

/** Returns true if this is a plain Workers AI REST config (accountId + apiKey, no gatewayId) */
export function isDirectCredentialsConfig(
	config: WorkersAiAdapterConfig,
): config is WorkersAiDirectCredentialsConfig {
	return "accountId" in config && "apiKey" in config && !("gatewayId" in config);
}

/** Returns true if this is an AI Gateway config (has gateway binding or `gatewayId`) */
export function isGatewayConfig(config: WorkersAiAdapterConfig): config is AiGatewayAdapterConfig {
	if ("gatewayId" in config) return true;
	// Has `binding` but NOT a direct Workers AI binding (no .gateway method)
	return "binding" in config && !isDirectBindingConfig(config);
}

// ---------------------------------------------------------------------------
// createGatewayFetch -- for routing through AI Gateway
// ---------------------------------------------------------------------------

export function createGatewayFetch(
	provider: string,
	config: AiGatewayAdapterConfig,
	headers: Record<string, string> = {},
): typeof fetch {
	return (input, init) => {
		let query: Record<string, unknown> = {};

		const url =
			typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		const urlObj = new URL(url);

		// Extract endpoint path (remove /v1/ prefix if present)
		const endpoint = urlObj.pathname.replace(/^\/v1\//, "").replace(/^\//, "") + urlObj.search;

		if (init?.body) {
			try {
				query = JSON.parse(init.body as string);
			} catch {
				query = { _raw: init.body };
			}
		}

		const cacheHeaders: Record<string, string | number | boolean> = {};

		if ("skipCache" in config && config.skipCache) {
			cacheHeaders["cf-aig-skip-cache"] = true;
		}

		if (typeof config.cacheTtl === "number") {
			cacheHeaders["cf-aig-cache-ttl"] = config.cacheTtl;
		}

		if (typeof config.customCacheKey === "string") {
			cacheHeaders["cf-aig-cache-key"] = config.customCacheKey;
		}

		if (typeof config.metadata === "object") {
			cacheHeaders["cf-aig-metadata"] = JSON.stringify(config.metadata);
		}

		const request = {
			provider,
			endpoint,
			headers: {
				...init?.headers,
				...headers,
				...cacheHeaders,
				"Content-Type": "application/json",
			} as Record<string, string>,
			query,
		};

		if (provider === "workers-ai") {
			request.endpoint = query.model as string;
			delete query.model;
			delete query.instructions;
		}

		if (config.apiKey) {
			request.headers["authorization"] = `Bearer ${config.apiKey}`;
		}

		if ("binding" in config) {
			return config.binding.run(request);
		}

		return fetch(
			`https://gateway.ai.cloudflare.com/v1/${config.accountId}/${config.gatewayId}`,
			{
				...init,
				headers: {
					"Content-Type": "application/json",
					...headers,
					...cacheHeaders,
					...(config.cfApiKey
						? { "cf-aig-authorization": `Bearer ${config.cfApiKey}` }
						: {}),
				},
				body: JSON.stringify(request),
			},
		);
	};
}

// ---------------------------------------------------------------------------
// createWorkersAiBindingFetch -- shim that makes env.AI look like an OpenAI endpoint
// ---------------------------------------------------------------------------

/**
 * Creates a fetch function that intercepts OpenAI SDK requests and translates them
 * to Workers AI binding calls (env.AI.run). This allows the WorkersAiTextAdapter
 * to use the OpenAI SDK against a plain Workers AI binding.
 *
 * NOTE: The `input` URL parameter is intentionally ignored. The model name and all
 * request parameters are extracted from the JSON body, matching Workers AI's
 * `binding.run(model, inputs)` calling convention.
 */
export function createWorkersAiBindingFetch(binding: WorkersAiBinding): typeof fetch {
	return async (_input, init) => {
		if (!init?.body) {
			return new Response("No body", { status: 400 });
		}

		let body: Record<string, unknown>;
		try {
			body = JSON.parse(init.body as string);
		} catch {
			return new Response("Invalid JSON body", { status: 400 });
		}

		const model = body.model as string;
		const stream = body.stream as boolean | undefined;

		// Build Workers AI inputs from OpenAI format
		const inputs: Record<string, unknown> = {};
		if (body.messages) inputs.messages = body.messages;
		if (body.tools) inputs.tools = body.tools;
		if (typeof body.temperature === "number") inputs.temperature = body.temperature;
		if (typeof body.max_tokens === "number") inputs.max_tokens = body.max_tokens;
		if (body.response_format) inputs.response_format = body.response_format;
		if (stream) inputs.stream = true;

		const result = await binding.run(model, inputs);

		if (stream && result instanceof ReadableStream) {
			// Workers AI returns an SSE stream with `data: {"response":"chunk"}` format.
			// Transform it to OpenAI-compatible SSE format.
			const transformed = transformWorkersAiStream(
				result as ReadableStream<Uint8Array>,
				model,
			);
			return new Response(transformed, {
				headers: {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
				},
			});
		}

		// Non-streaming: Workers AI returns { response: "text", tool_calls?: [...] }
		// Wrap into OpenAI Chat Completion format.
		const responseObj =
			typeof result === "object" && result !== null
				? (result as Record<string, unknown>)
				: { response: String(result) };

		const responseText = typeof responseObj.response === "string" ? responseObj.response : "";

		const message: Record<string, unknown> = {
			role: "assistant",
			content: responseText,
		};
		let finishReason = "stop";

		// Handle tool calls if present in Workers AI response
		if (Array.isArray(responseObj.tool_calls) && responseObj.tool_calls.length > 0) {
			finishReason = "tool_calls";
			message.tool_calls = responseObj.tool_calls.map(
				(tc: { name: string; arguments: unknown }, i: number) => ({
					id: `call_${Date.now()}_${i}`,
					type: "function",
					function: {
						name: tc.name,
						arguments:
							typeof tc.arguments === "string"
								? tc.arguments
								: JSON.stringify(tc.arguments),
					},
				}),
			);
		}

		const openAiResponse = {
			id: `workers-ai-${Date.now()}`,
			object: "chat.completion",
			created: Math.floor(Date.now() / 1000),
			model,
			choices: [{ index: 0, message, finish_reason: finishReason }],
		};

		return new Response(JSON.stringify(openAiResponse), {
			headers: { "Content-Type": "application/json" },
		});
	};
}

// ---------------------------------------------------------------------------
// Stream transformer: Workers AI SSE -> OpenAI-compatible SSE
// Uses TransformStream for proper backpressure.
// ---------------------------------------------------------------------------

/**
 * Transforms a Workers AI SSE stream (data: {"response":"chunk"}) into
 * an OpenAI-compatible SSE stream (data: {"choices":[{"delta":{"content":"chunk"}}]}).
 * Also handles tool_calls in the Workers AI response.
 */
function transformWorkersAiStream(
	source: ReadableStream<Uint8Array>,
	model: string,
): ReadableStream<Uint8Array> {
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	// Generate a stable ID and timestamp for the entire stream, matching OpenAI's
	// convention where all chunks in a single response share the same id/created.
	const streamId = `workers-ai-${Date.now()}`;
	const created = Math.floor(Date.now() / 1000);
	let buffer = "";
	let hasToolCalls = false;
	let toolCallCounter = 0;

	return source.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				buffer += decoder.decode(chunk, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed || !trimmed.startsWith("data: ")) continue;
					const data = trimmed.slice(6);

					// Swallow source [DONE]; we emit our own clean finish in flush()
					if (data === "[DONE]") continue;

					try {
						const parsed = JSON.parse(data);

						// Text content
						if (parsed.response != null && parsed.response !== "") {
							const openAiChunk = {
								id: streamId,
								object: "chat.completion.chunk",
								created,
								model,
								choices: [
									{
										index: 0,
										delta: { content: parsed.response },
										finish_reason: null,
									},
								],
							};
							controller.enqueue(
								encoder.encode(`data: ${JSON.stringify(openAiChunk)}\n\n`),
							);
						}

						// Tool calls
						if (Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
							hasToolCalls = true;
							for (let i = 0; i < parsed.tool_calls.length; i++) {
								const tc = parsed.tool_calls[i];
								const toolChunk = {
									id: streamId,
									object: "chat.completion.chunk",
									created,
									model,
									choices: [
										{
											index: 0,
											delta: {
												tool_calls: [
													{
														index: i,
														id: `call_${streamId}_${toolCallCounter++}`,
														type: "function",
														function: {
															name: tc.name,
															arguments:
																typeof tc.arguments === "string"
																	? tc.arguments
																	: JSON.stringify(tc.arguments),
														},
													},
												],
											},
											finish_reason: null,
										},
									],
								};
								controller.enqueue(
									encoder.encode(`data: ${JSON.stringify(toolChunk)}\n\n`),
								);
							}
						}
					} catch {
						// Skip malformed SSE events
					}
				}
			},
			flush(controller) {
				// Emit exactly one finish chunk and one [DONE]
				const finalChunk = {
					id: streamId,
					object: "chat.completion.chunk",
					created,
					model,
					choices: [
						{
							index: 0,
							delta: {},
							finish_reason: hasToolCalls ? "tool_calls" : "stop",
						},
					],
				};
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`));
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
			},
		}),
	);
}
