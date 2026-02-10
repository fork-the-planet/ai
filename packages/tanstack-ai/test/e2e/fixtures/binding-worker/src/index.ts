/**
 * Test worker exercising @cloudflare/tanstack-ai through the env.AI binding.
 *
 * Each endpoint creates a WorkersAiTextAdapter with { binding: env.AI },
 * runs the adapter, and returns the collected AG-UI stream chunks as JSON.
 *
 * This worker is started by wrangler dev during integration tests.
 */
import {
	createWorkersAiChat,
	type WorkersAiTextModel,
} from "../../../../../src/index";

interface Env {
	AI: Ai;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect all chunks from the adapter's chatStream */
async function collectChunks(iterable: AsyncIterable<unknown>): Promise<unknown[]> {
	const chunks: unknown[] = [];
	for await (const chunk of iterable) {
		chunks.push(chunk);
	}
	return chunks;
}

function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data, null, 2), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Health check
		if (url.pathname === "/health") {
			return jsonResponse({ ok: true });
		}

		if (request.method !== "POST") {
			return jsonResponse({ error: "POST required" }, 405);
		}

		const body = (await request.json()) as {
			model?: string;
			messages?: Array<{ role: string; content: string }>;
		};
		const model = (body.model ||
			"@cf/meta/llama-4-scout-17b-16e-instruct") as WorkersAiTextModel;

		const adapter = createWorkersAiChat(model, { binding: env.AI });

		try {
			switch (url.pathname) {
				// ----- Raw binding stream (for debugging) -----
				case "/debug/raw-stream": {
					const messages = body.messages || [
						{ role: "user", content: "Say hello in exactly one sentence." },
					];
					const result = await (env.AI as any).run(model, {
						messages,
						stream: true,
					});

					if (result instanceof ReadableStream) {
						const reader = (result as ReadableStream<Uint8Array>).getReader();
						const decoder = new TextDecoder();
						let raw = "";
						let done = false;
						while (!done) {
							const { value, done: d } = await reader.read();
							done = d;
							if (value) raw += decoder.decode(value, { stream: true });
						}
						return new Response(raw, {
							headers: { "Content-Type": "text/plain" },
						});
					}
					return jsonResponse({ type: "non-stream", result });
				}
				// ----- Basic chat -----
				case "/chat": {
					const chunks = await collectChunks(
						adapter.chatStream({
							model,
							messages: body.messages || [
								{
									role: "user",
									content: "Say hello in exactly one sentence.",
								},
							],
							temperature: 0,
						} as any),
					);
					return jsonResponse({ chunks });
				}

				// ----- Multi-turn -----
				case "/chat/multi-turn": {
					const chunks = await collectChunks(
						adapter.chatStream({
							model,
							messages: [
								{ role: "user", content: "My name is Alice." },
								{
									role: "assistant",
									content: "Hello Alice! Nice to meet you.",
								},
								{ role: "user", content: "What is my name?" },
							],
							temperature: 0,
						} as any),
					);
					return jsonResponse({ chunks });
				}

				// ----- Tool call (first round only) -----
				case "/chat/tool-call": {
					const chunks = await collectChunks(
						adapter.chatStream({
							model,
							messages: [
								{
									role: "user",
									content:
										"What is 2 + 3? You MUST use the calculator tool to answer.",
								},
							],
							tools: [
								{
									name: "calculator",
									description:
										"Add two numbers. Returns their sum. Always use this tool for math.",
									inputSchema: {
										type: "object",
										properties: {
											a: { type: "number", description: "first number" },
											b: { type: "number", description: "second number" },
										},
										required: ["a", "b"],
									},
								},
							],
							temperature: 0,
						} as any),
					);
					return jsonResponse({ chunks });
				}

				// ----- Tool round-trip (two calls simulating chat() loop) -----
				case "/chat/tool-roundtrip": {
					// Step 1: model calls tool
					const step1Chunks = await collectChunks(
						adapter.chatStream({
							model,
							messages: [
								{
									role: "user",
									content:
										"What time is it? Use the get_current_time tool.",
								},
							],
							tools: [
								{
									name: "get_current_time",
									description:
										"Get the current UTC time. Always use this tool when asked about the time.",
									inputSchema: {
										type: "object",
										properties: {},
										required: [],
									},
								},
							],
							temperature: 0,
						} as any),
					);

					// Extract tool call info from step 1
					const toolEnd = step1Chunks.find(
						(c: any) => c.type === "TOOL_CALL_END",
					) as any;

					if (!toolEnd || !toolEnd.toolName) {
						return jsonResponse({
							step1Chunks,
							error: "Step 1: no tool call emitted",
						});
					}

					// Step 2: provide tool result, model responds with text
					const step2Chunks = await collectChunks(
						adapter.chatStream({
							model,
							messages: [
								{
									role: "user",
									content:
										"What time is it? Use the get_current_time tool.",
								},
								{
									role: "assistant",
									content: "",
									toolCalls: [
										{
											id: toolEnd.toolCallId,
											function: {
												name: toolEnd.toolName,
												arguments: JSON.stringify(
													toolEnd.input || {},
												),
											},
										},
									],
								},
								{
									role: "tool",
									toolCallId: toolEnd.toolCallId,
									content: JSON.stringify({
										time: "2026-02-08T15:30:00.000Z",
									}),
								},
							],
							tools: [
								{
									name: "get_current_time",
									description:
										"Get the current UTC time. Always use this tool when asked about the time.",
									inputSchema: {
										type: "object",
										properties: {},
										required: [],
									},
								},
							],
							temperature: 0,
						} as any),
					);

					return jsonResponse({ step1Chunks, step2Chunks });
				}

				// ----- Structured output -----
				case "/chat/structured": {
					const result = await adapter.structuredOutput({
						outputSchema: {
							type: "object",
							properties: {
								name: { type: "string" },
								capital: { type: "string" },
								population: { type: "number" },
							},
							required: ["name", "capital", "population"],
							additionalProperties: false,
						},
						chatOptions: {
							model,
							messages: [
								{
									role: "user",
									content:
										"Give me info about France. Return JSON with name, capital, and population.",
								},
							],
							temperature: 0,
						},
					} as any);
					return jsonResponse({ result });
				}

				default:
					return jsonResponse({ error: `Unknown path: ${url.pathname}` }, 404);
			}
		} catch (err: any) {
			return jsonResponse(
				{
					error: err.message,
					stack: err.stack,
				},
				500,
			);
		}
	},
};
