/**
 * E2E tests for Workers AI via REST API.
 *
 * These tests call the real Cloudflare Workers AI API. They require valid
 * credentials in a `.env` file at the package root:
 *
 *   CLOUDFLARE_ACCOUNT_ID=<your account id>
 *   CLOUDFLARE_API_TOKEN=<your API token with Workers AI access>
 *
 * Run with: pnpm test:e2e
 *
 * These are excluded from the default `pnpm test` / `pnpm test:ci` runs.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

// Load env vars from .env at package root
import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url).pathname });

// We need to mock @tanstack/ai and @tanstack/ai/adapters so the adapter
// module can be imported without the full TanStack dependency graph being
// present in the test runner.
vi.mock("@tanstack/ai/adapters", () => ({
	BaseTextAdapter: class {
		model: string;
		constructor(_config: unknown, model: string) {
			this.model = model;
		}
	},
}));
vi.mock("@tanstack/ai", () => ({}));

import { WorkersAiTextAdapter } from "../../src/adapters/workers-ai";
import type { WorkersAiTextModel } from "../../src/adapters/workers-ai";

// ---------------------------------------------------------------------------
// Config & helpers
// ---------------------------------------------------------------------------

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

function skip() {
	return !ACCOUNT_ID || !API_TOKEN;
}

/** Collect all chunks from an async iterable */
async function collectChunks(iterable: AsyncIterable<unknown>) {
	const chunks: any[] = [];
	for await (const chunk of iterable) {
		chunks.push(chunk);
	}
	return chunks;
}

/** Find a chunk by type */
function findChunk(chunks: any[], type: string) {
	return chunks.find((c) => c.type === type);
}

/** Filter chunks by type */
function filterChunks(chunks: any[], type: string) {
	return chunks.filter((c) => c.type === type);
}

function makeAdapter(modelId: string) {
	return new WorkersAiTextAdapter(modelId as WorkersAiTextModel, {
		accountId: ACCOUNT_ID!,
		apiKey: API_TOKEN!,
	});
}

// ---------------------------------------------------------------------------
// Results tracker — accumulates per-model outcomes, prints table at the end
// ---------------------------------------------------------------------------

type Status = "ok" | "warn" | "fail";

const results: Record<
	string,
	{ chat: Status; multiTurn: Status; toolCalling: Status; toolRoundTrip: Status; structuredOutput: Status; notes: string[] }
> = {};

function getResult(label: string) {
	if (!results[label]) {
		results[label] = { chat: "fail", multiTurn: "fail", toolCalling: "fail", toolRoundTrip: "fail", structuredOutput: "fail", notes: [] };
	}
	return results[label];
}

function statusIcon(s: Status): string {
	if (s === "ok") return "  OK";
	if (s === "warn") return "  ~ ";
	return "  X ";
}

function printSummaryTable() {
	const labels = Object.keys(results);
	if (labels.length === 0) return;

	const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));
	const maxLabel = Math.max(...labels.map((l) => l.length), 5);

	const header = `${pad("Model", maxLabel)} | Chat | Turn | Tool | T-RT | JSON | Notes`;
	const sep = "-".repeat(header.length + 10);

	console.log("\n" + sep);
	console.log("  WORKERS AI MODEL COMPARISON");
	console.log(sep);
	console.log(header);
	console.log(sep);

	for (const label of labels) {
		const r = results[label]!;
		const notes = r.notes.length > 0 ? r.notes.join("; ") : "";
		console.log(
			`${pad(label, maxLabel)} | ${statusIcon(r.chat)} | ${statusIcon(r.multiTurn)} | ${statusIcon(r.toolCalling)} | ${statusIcon(r.toolRoundTrip)} | ${statusIcon(r.structuredOutput)} | ${notes}`,
		);
	}

	console.log(sep);
	console.log("  OK = works correctly    ~ = partial/quirky    X = broken/error");
	console.log("  T-RT = tool round-trip (call tool → provide result → model responds)");
	console.log(sep + "\n");
}

// ---------------------------------------------------------------------------
// Models to test
// ---------------------------------------------------------------------------

const MODELS = [
	{ id: "@cf/meta/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout 17B" },
	{ id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B" },
	{ id: "@cf/meta/llama-3.1-8b-instruct-fast", label: "Llama 3.1 8B Fast" },
	{ id: "@cf/openai/gpt-oss-120b", label: "GPT-OSS 120B" },
	{ id: "@cf/openai/gpt-oss-20b", label: "GPT-OSS 20B" },
	{ id: "@cf/qwen/qwen3-30b-a3b-fp8", label: "Qwen3 30B" },
	{ id: "@cf/qwen/qwq-32b", label: "QwQ 32B (reasoning)" },
	{ id: "@cf/google/gemma-3-12b-it", label: "Gemma 3 12B" },
	{ id: "@cf/mistralai/mistral-small-3.1-24b-instruct", label: "Mistral Small 3.1" },
	{ id: "@cf/deepseek/deepseek-r1-distill-qwen-32b", label: "DeepSeek R1 32B" },
	{ id: "@cf/ibm/granite-4.0-h-micro", label: "Granite 4.0 Micro" },
	{ id: "@cf/moonshotai/kimi-k2.5", label: "Kimi K2.5" },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(skip())("Workers AI REST E2E", () => {

	afterAll(() => {
		printSummaryTable();
	});

	// ------------------------------------------------------------------
	// Per-model: basic chat
	// ------------------------------------------------------------------

	describe("chat (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — basic chat streaming`, async () => {
				const r = getResult(model.label);
				const adapter = makeAdapter(model.id);
				const chunks = await collectChunks(
					adapter.chatStream({
						model: model.id as WorkersAiTextModel,
						messages: [{ role: "user", content: "Say hello in one sentence." }],
						temperature: 0,
					} as any),
				);

				const runStarted = findChunk(chunks, "RUN_STARTED");
				const runFinished = findChunk(chunks, "RUN_FINISHED");
				const runError = findChunk(chunks, "RUN_ERROR");
				const contentChunks = filterChunks(chunks, "TEXT_MESSAGE_CONTENT");

				expect(runStarted).toBeDefined();

				if (runError) {
					r.chat = "fail";
					r.notes.push(`chat: ${runError.error?.message}`);
					return;
				}

				expect(runFinished).toBeDefined();

				if (contentChunks.length > 0) {
					r.chat = "ok";
				} else {
					r.chat = "warn";
					r.notes.push("chat: 0 content chunks");
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Per-model: multi-turn conversation
	// ------------------------------------------------------------------

	describe("multi-turn (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — remembers context across turns`, async () => {
				const r = getResult(model.label);
				const adapter = makeAdapter(model.id);
				const chunks = await collectChunks(
					adapter.chatStream({
						model: model.id as WorkersAiTextModel,
						messages: [
							{ role: "user", content: "My name is Alice." },
							{ role: "assistant", content: "Hello Alice! Nice to meet you." },
							{ role: "user", content: "What is my name?" },
						],
						temperature: 0,
					} as any),
				);

				const runError = findChunk(chunks, "RUN_ERROR");
				const contentChunks = filterChunks(chunks, "TEXT_MESSAGE_CONTENT");

				if (runError) {
					r.multiTurn = "fail";
					r.notes.push(`turn: ${runError.error?.message}`);
					return;
				}

				if (contentChunks.length === 0) {
					r.multiTurn = "warn";
					r.notes.push("turn: no content");
					return;
				}

				const fullText = contentChunks[contentChunks.length - 1].content;
				const remembers = fullText.toLowerCase().includes("alice");

				if (remembers) {
					r.multiTurn = "ok";
				} else {
					r.multiTurn = "warn";
					r.notes.push("turn: forgot context");
				}

				expect(findChunk(chunks, "RUN_STARTED")).toBeDefined();
				expect(findChunk(chunks, "RUN_FINISHED")).toBeDefined();
			});
		}
	});

	// ------------------------------------------------------------------
	// Per-model: tool calling
	// ------------------------------------------------------------------

	describe("tool calling (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — tool calling`, async () => {
				const r = getResult(model.label);
				const adapter = makeAdapter(model.id);

				let chunks: any[];
				try {
					chunks = await collectChunks(
						adapter.chatStream({
							model: model.id as WorkersAiTextModel,
							messages: [
								{
									role: "user",
									content:
										"What is 123 + 456? You MUST use the calculator tool to answer.",
								},
							],
							tools: [
								{
									name: "calculator",
									description:
										"Add two numbers together. Returns their sum. Always use this tool for math.",
									inputSchema: {
										type: "object",
										properties: {
											a: { type: "number", description: "First number" },
											b: { type: "number", description: "Second number" },
										},
										required: ["a", "b"],
									},
								},
							],
							temperature: 0,
						} as any),
					);
				} catch (err: any) {
					r.toolCalling = "fail";
					r.notes.push(`tool: threw ${err.message.slice(0, 40)}`);
					return;
				}

				const toolStarts = filterChunks(chunks, "TOOL_CALL_START");
				const toolEnds = filterChunks(chunks, "TOOL_CALL_END");
				const contentChunks = filterChunks(chunks, "TEXT_MESSAGE_CONTENT");
				const runError = findChunk(chunks, "RUN_ERROR");
				const runFinished = findChunk(chunks, "RUN_FINISHED");

				expect(findChunk(chunks, "RUN_STARTED")).toBeDefined();

				if (runError) {
					r.toolCalling = "fail";
					r.notes.push(`tool: ${runError.error?.message?.slice(0, 40)}`);
					return;
				}

				expect(runFinished).toBeDefined();

				if (toolStarts.length > 0) {
					expect(toolStarts[0].toolName).toBe("calculator");
					expect(toolEnds.length).toBeGreaterThanOrEqual(1);
					if (toolEnds.length !== toolStarts.length) {
						r.toolCalling = "warn";
						r.notes.push(`tool: ${toolStarts.length} starts/${toolEnds.length} ends`);
					} else {
						r.toolCalling = "ok";
					}
				} else if (contentChunks.length > 0) {
					r.toolCalling = "warn";
					r.notes.push("tool: answered as text");
				} else {
					r.toolCalling = "fail";
					r.notes.push("tool: empty response");
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Per-model: tool result round-trip
	// Simulates: user asks → model calls tool → tool result provided → model responds with text
	// This is the full loop that TanStack's chat() does automatically.
	// ------------------------------------------------------------------

	describe("tool result round-trip (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — tool result round-trip`, async () => {
				const r = getResult(model.label);
				const adapter = makeAdapter(model.id);

				// Step 1: send user message with tool available
				let firstChunks: any[];
				try {
					firstChunks = await collectChunks(
						adapter.chatStream({
							model: model.id as WorkersAiTextModel,
							messages: [
								{
									role: "user",
									content: "What time is it? Use the get_current_time tool.",
								},
							],
							tools: [
								{
									name: "get_current_time",
									description: "Get the current UTC time. Always use this tool when asked about the time.",
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
				} catch (err: any) {
					r.toolRoundTrip = "fail";
					r.notes.push(`t-rt: step1 threw ${err.message.slice(0, 30)}`);
					return;
				}

				const firstError = findChunk(firstChunks, "RUN_ERROR");
				if (firstError) {
					r.toolRoundTrip = "fail";
					r.notes.push(`t-rt: step1 error ${firstError.error?.message?.slice(0, 30)}`);
					return;
				}

				const toolStarts = filterChunks(firstChunks, "TOOL_CALL_START");
				const firstContent = filterChunks(firstChunks, "TEXT_MESSAGE_CONTENT");

				if (toolStarts.length === 0) {
					// Model didn't call the tool — answered directly
					if (firstContent.length > 0) {
						r.toolRoundTrip = "warn";
						r.notes.push("t-rt: skipped tool, answered directly");
					} else {
						r.toolRoundTrip = "fail";
						r.notes.push("t-rt: no tool call and no content");
					}
					return;
				}

				// Step 2: provide tool result and ask model to respond
				const toolCallEnd = findChunk(firstChunks, "TOOL_CALL_END");
				const toolCallId = toolCallEnd?.toolCallId || "call_1";
				const toolName = toolCallEnd?.toolName || "get_current_time";

				let secondChunks: any[];
				try {
					secondChunks = await collectChunks(
						adapter.chatStream({
							model: model.id as WorkersAiTextModel,
							messages: [
								{
									role: "user",
									content: "What time is it? Use the get_current_time tool.",
								},
								{
									role: "assistant",
									content: "",
									toolCalls: [
										{
											id: toolCallId,
											function: {
												name: toolName,
												arguments: "{}",
											},
										},
									],
								},
								{
									role: "tool",
									toolCallId: toolCallId,
									content: JSON.stringify({ time: "2026-02-08T15:30:00.000Z" }),
								},
							],
							tools: [
								{
									name: "get_current_time",
									description: "Get the current UTC time. Always use this tool when asked about the time.",
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
				} catch (err: any) {
					r.toolRoundTrip = "fail";
					r.notes.push(`t-rt: step2 threw ${err.message.slice(0, 30)}`);
					return;
				}

				const secondError = findChunk(secondChunks, "RUN_ERROR");
				if (secondError) {
					r.toolRoundTrip = "fail";
					r.notes.push(`t-rt: step2 error ${secondError.error?.message?.slice(0, 30)}`);
					return;
				}

				const secondContent = filterChunks(secondChunks, "TEXT_MESSAGE_CONTENT");
				const secondFinished = findChunk(secondChunks, "RUN_FINISHED");

				if (secondContent.length > 0 && secondFinished) {
					const text = secondContent[secondContent.length - 1].content;
					r.toolRoundTrip = "ok";
					console.log(`  ✓ ${model.label}: tool round-trip OK — "${text.slice(0, 80)}"`);
				} else if (secondFinished) {
					r.toolRoundTrip = "fail";
					r.notes.push("t-rt: step2 finished but 0 content");
					console.warn(`  ✗ ${model.label}: tool round-trip EMPTY — model produced no text after tool result`);
				} else {
					r.toolRoundTrip = "fail";
					r.notes.push("t-rt: step2 no finish");
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Per-model: structured output
	// ------------------------------------------------------------------

	describe("structured output (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — structured output`, async () => {
				const r = getResult(model.label);
				const adapter = makeAdapter(model.id);

				let result: any;
				try {
					result = await adapter.structuredOutput({
						outputSchema: {
							type: "object",
							properties: {
								capital: { type: "string" },
								population_millions: { type: "number" },
							},
							required: ["capital", "population_millions"],
						},
						chatOptions: {
							model: model.id as WorkersAiTextModel,
							messages: [
								{
									role: "user",
									content:
										"What is the capital of France and its approximate population in millions?",
								},
							],
							temperature: 0,
						},
					} as any);
				} catch (err: any) {
					r.structuredOutput = "fail";
					r.notes.push(`json: threw ${err.message.slice(0, 40)}`);
					return;
				}

				expect(result).toBeDefined();

				if (
					typeof result.rawText === "string" &&
					result.rawText.length > 0 &&
					typeof result.data === "object" &&
					result.data !== null
				) {
					const data = result.data as Record<string, unknown>;
					const hasCapital = typeof data.capital === "string";
					const hasPop = typeof data.population_millions === "number";

					if (hasCapital && hasPop) {
						r.structuredOutput = "ok";
					} else {
						r.structuredOutput = "warn";
						r.notes.push("json: wrong shape");
					}
				} else {
					r.structuredOutput = "fail";
					r.notes.push(`json: got ${typeof result.data} instead of object`);
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// System prompts (one model is enough)
	// ------------------------------------------------------------------

	describe("system prompts", () => {
		it("should handle system prompts (Llama 3.1 8B)", async () => {
			const adapter = makeAdapter("@cf/meta/llama-3.1-8b-instruct-fast");
			const chunks = await collectChunks(
				adapter.chatStream({
					model: "@cf/meta/llama-3.1-8b-instruct-fast" as WorkersAiTextModel,
					systemPrompts: ["You are a pirate. Always respond in pirate speak."],
					messages: [{ role: "user", content: "Say hello." }],
					temperature: 0.5,
				} as any),
			);

			const contentChunks = filterChunks(chunks, "TEXT_MESSAGE_CONTENT");
			expect(contentChunks.length).toBeGreaterThan(0);

			const runFinished = findChunk(chunks, "RUN_FINISHED");
			expect(runFinished).toBeDefined();
			expect(runFinished.finishReason).toBe("stop");
		});
	});

	// ------------------------------------------------------------------
	// Error handling
	// ------------------------------------------------------------------

	describe("error handling", () => {
		it("should emit RUN_ERROR for an invalid model", async () => {
			const badAdapter = makeAdapter("@cf/nonexistent/fake-model-999");

			const chunks = await collectChunks(
				badAdapter.chatStream({
					model: "@cf/nonexistent/fake-model-999" as WorkersAiTextModel,
					messages: [{ role: "user", content: "Hi" }],
				} as any),
			);

			const runError = findChunk(chunks, "RUN_ERROR");
			expect(runError).toBeDefined();
			expect(runError.error).toBeDefined();
			expect(typeof runError.error.message).toBe("string");
		});
	});
});
