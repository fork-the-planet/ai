/**
 * E2E tests for Workers AI via REST API.
 *
 * These tests call the real Cloudflare Workers AI API. They require valid
 * credentials in a `.env` file at the package root:
 *
 *   CLOUDFLARE_ACCOUNT_ID=<your account id>
 *   CLOUDFLARE_API_TOKEN=<your API token with Workers AI access>
 *
 * Run with: pnpm test:e2e:rest
 *
 * These are excluded from the default `pnpm test` / `pnpm test:ci` runs.
 */
import { afterAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { generateText, streamText, stepCountIs, Output, generateImage, embedMany } from "ai";
import { z } from "zod/v4";
import { createWorkersAI } from "../../src/index";

// Load env vars from .env at package root
config({ path: new URL("../../.env", import.meta.url).pathname });

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

function skip() {
	return !ACCOUNT_ID || !API_TOKEN;
}

function makeProvider() {
	return createWorkersAI({
		accountId: ACCOUNT_ID!,
		apiKey: API_TOKEN!,
	});
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
] as const;

type ModelId = (typeof MODELS)[number]["id"];

// ---------------------------------------------------------------------------
// Results tracker
// ---------------------------------------------------------------------------

type Status = "ok" | "warn" | "fail" | "skip";

const results: Record<
	string,
	{
		chat: Status;
		multiTurn: Status;
		toolCalling: Status;
		toolRoundTrip: Status;
		structuredOutput: Status;
		notes: string[];
	}
> = {};

function getResult(label: string) {
	if (!results[label]) {
		results[label] = {
			chat: "skip",
			multiTurn: "skip",
			toolCalling: "skip",
			toolRoundTrip: "skip",
			structuredOutput: "skip",
			notes: [],
		};
	}
	return results[label];
}

function statusIcon(s: Status): string {
	switch (s) {
		case "ok":
			return "  OK";
		case "warn":
			return "  ~ ";
		case "fail":
			return "  X ";
		case "skip":
			return "  - ";
	}
}

function printSummaryTable() {
	const labels = Object.keys(results);
	if (labels.length === 0) return;

	const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));
	const maxLabel = Math.max(...labels.map((l) => l.length), 5);

	const header = `${pad("Model", maxLabel)} | Chat | Turn | Tool | T-RT | JSON | Notes`;
	const sep = "-".repeat(header.length + 10);

	console.log(`\n${sep}`);
	console.log("  WORKERS AI REST API — E2E RESULTS");
	console.log(sep);
	console.log(header);
	console.log(sep);

	for (const label of labels) {
		const r = results[label];
		const notes = r.notes.length > 0 ? r.notes.join("; ") : "";
		console.log(
			`${pad(label, maxLabel)} | ${statusIcon(r.chat)} | ${statusIcon(r.multiTurn)} | ${statusIcon(r.toolCalling)} | ${statusIcon(r.toolRoundTrip)} | ${statusIcon(r.structuredOutput)} | ${notes}`,
		);
	}

	console.log(sep);
	console.log("  OK = works    ~ = partial/quirky    X = broken    - = skipped");
	console.log(`${sep}\n`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(skip())("Workers AI REST E2E", () => {
	afterAll(() => {
		printSummaryTable();
	});

	// ------------------------------------------------------------------
	// Basic chat (per model)
	// ------------------------------------------------------------------
	describe("basic chat", () => {
		for (const model of MODELS) {
			it(`${model.label} — streaming chat`, async () => {
				const r = getResult(model.label);

				try {
					const provider = makeProvider();
					const result = streamText({
						model: provider(model.id as ModelId),
						messages: [{ role: "user", content: "Say hello in one sentence." }],
					});

					let text = "";
					for await (const chunk of result.textStream) {
						text += chunk;
					}

					if (text.length > 0) {
						r.chat = "ok";
					} else {
						r.chat = "warn";
						r.notes.push("chat: empty response");
					}
				} catch (err: unknown) {
					r.chat = "fail";
					r.notes.push(`chat: ${(err as Error).message.slice(0, 60)}`);
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Multi-turn conversation (per model)
	// ------------------------------------------------------------------
	describe("multi-turn", () => {
		for (const model of MODELS) {
			it(`${model.label} — remembers context`, async () => {
				const r = getResult(model.label);

				try {
					const provider = makeProvider();
					const { text } = await generateText({
						model: provider(model.id as ModelId),
						messages: [
							{ role: "user", content: "My name is Alice." },
							{ role: "assistant", content: "Hello Alice! Nice to meet you." },
							{ role: "user", content: "What is my name?" },
						],
					});

					if (text.toLowerCase().includes("alice")) {
						r.multiTurn = "ok";
					} else {
						r.multiTurn = "warn";
						r.notes.push("turn: forgot context");
					}
				} catch (err: unknown) {
					r.multiTurn = "fail";
					r.notes.push(`turn: ${(err as Error).message.slice(0, 60)}`);
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Tool calling (per model)
	// ------------------------------------------------------------------
	describe("tool calling", () => {
		for (const model of MODELS) {
			it(`${model.label} — tool calling`, async () => {
				const r = getResult(model.label);

				try {
					const provider = makeProvider();
					const result = await generateText({
						model: provider(model.id as ModelId),
						messages: [
							{
								role: "user",
								content:
									"What is 123 + 456? You MUST use the calculator tool to answer.",
							},
						],
						tools: {
							calculator: {
								description:
									"Add two numbers. Returns their sum. Always use this tool for math.",
								inputSchema: z.object({
									a: z.number().describe("First number"),
									b: z.number().describe("Second number"),
								}),
							},
						},
					});

					if (result.toolCalls && result.toolCalls.length > 0) {
						r.toolCalling = "ok";
					} else if (result.text.length > 0) {
						r.toolCalling = "warn";
						r.notes.push("tool: answered as text");
					} else {
						r.toolCalling = "fail";
						r.notes.push("tool: empty response");
					}
				} catch (err: unknown) {
					r.toolCalling = "fail";
					r.notes.push(`tool: ${(err as Error).message.slice(0, 60)}`);
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Tool round-trip (per model)
	// Uses maxSteps so the SDK handles the full round-trip:
	//   user asks -> model calls tool -> tool executes -> model responds with text
	// ------------------------------------------------------------------
	describe("tool round-trip", () => {
		for (const model of MODELS) {
			it(`${model.label} — tool result round-trip`, async () => {
				const r = getResult(model.label);

				try {
					const provider = makeProvider();

					const result = await generateText({
						model: provider(model.id as ModelId),
						messages: [
							{
								role: "user",
								content:
									"What time is it? Use the get_current_time tool to find out.",
							},
						],
						tools: {
							get_current_time: {
								description:
									"Get the current UTC time. Always use this tool when asked about the time.",
								inputSchema: z.object({}),
								execute: async () => ({
									time: "2026-02-10T15:30:00.000Z",
								}),
							},
						},
						stopWhen: stepCountIs(2),
					});

					// Check if tool was called (step count > 1 means round-trip happened)
					if (result.steps.length > 1 && result.text.length > 0) {
						r.toolRoundTrip = "ok";
					} else if (result.toolCalls && result.toolCalls.length > 0) {
						// Tool was called but model didn't produce text after result
						r.toolRoundTrip = "warn";
						r.notes.push("t-rt: tool called but no final text");
					} else if (result.text.length > 0) {
						r.toolRoundTrip = "warn";
						r.notes.push("t-rt: skipped tool, answered directly");
					} else {
						r.toolRoundTrip = "fail";
						r.notes.push("t-rt: no tool call or content");
					}
				} catch (err: unknown) {
					r.toolRoundTrip = "fail";
					r.notes.push(`t-rt: ${(err as Error).message.slice(0, 60)}`);
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Structured output (per model)
	// ------------------------------------------------------------------
	describe("structured output", () => {
		for (const model of MODELS) {
			it(`${model.label} — structured output`, async () => {
				const r = getResult(model.label);

				try {
					const provider = makeProvider();
					const result = await generateText({
						model: provider(model.id as ModelId),
						prompt: "What is the capital of France and its approximate population in millions?",
						output: Output.object({
							schema: z.object({
								capital: z.string(),
								population_millions: z.number(),
							}),
						}),
					});

					const object = result.output;
					if (
						object &&
						typeof object.capital === "string" &&
						typeof object.population_millions === "number"
					) {
						r.structuredOutput = "ok";
					} else {
						r.structuredOutput = "warn";
						r.notes.push("json: wrong shape");
					}
				} catch (err: unknown) {
					r.structuredOutput = "fail";
					r.notes.push(`json: ${(err as Error).message.slice(0, 60)}`);
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Image generation
	// ------------------------------------------------------------------
	describe("image generation", () => {
		it("Flux 1 Schnell — should generate an image", async () => {
			const provider = makeProvider();

			const result = await generateImage({
				model: provider.image("@cf/black-forest-labs/flux-1-schnell"),
				prompt: "A red circle on a white background",
				size: "256x256",
			});

			expect(result.images).toHaveLength(1);
			expect(result.images[0].uint8Array.length).toBeGreaterThan(100);
			console.log(
				`  [image] Flux 1 Schnell OK — ${result.images[0].uint8Array.length} bytes`,
			);
		});
	});

	// ------------------------------------------------------------------
	// Embeddings
	// ------------------------------------------------------------------
	describe("embeddings", () => {
		it("BGE Base EN — should generate embeddings", async () => {
			const provider = makeProvider();

			const result = await embedMany({
				model: provider.textEmbedding("@cf/baai/bge-base-en-v1.5"),
				values: ["Hello world", "Goodbye world"],
			});

			expect(result.embeddings).toHaveLength(2);
			expect(result.embeddings[0].length).toBe(768);
			expect(result.embeddings[1].length).toBe(768);
			console.log(`  [embed] BGE Base EN OK — ${result.embeddings[0].length} dimensions`);
		});
	});

	// ------------------------------------------------------------------
	// Error handling
	// ------------------------------------------------------------------
	describe("error handling", () => {
		it("should throw for an invalid model", async () => {
			const provider = makeProvider();
			await expect(
				generateText({
					model: provider("@cf/nonexistent/fake-model-999" as any),
					prompt: "Hi",
				}),
			).rejects.toThrow();
		});
	});
});
