/**
 * E2E integration tests for Workers AI via the env.AI binding.
 *
 * These tests start a real wrangler dev server with a test worker that exercises
 * our adapter through the Workers AI binding path. Unlike the REST E2E tests,
 * these validate the full binding fetch shim, including:
 *   - Stream transformer (nested tool call format)
 *   - Message normalization (null content, tool_call_id sanitization)
 *   - Tool call round-trips through the binding
 *
 * Prerequisites:
 *   - Authenticated with Cloudflare (`wrangler login` or CLOUDFLARE_API_TOKEN env var)
 *   - `pnpm build` has been run (the test worker imports from source, but openai dep
 *     must be resolvable)
 *
 * Run with: pnpm test:e2e
 */
import { type ChildProcess, spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKER_DIR = new URL("./fixtures/binding-worker", import.meta.url).pathname;
const PORT = 8799;
const BASE = `http://localhost:${PORT}`;

// Models to test — same set as REST e2e tests for apples-to-apples comparison
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

// ---------------------------------------------------------------------------
// Results tracker
// ---------------------------------------------------------------------------

type Status = "ok" | "warn" | "fail";

const results: Record<
	string,
	{
		chat: Status;
		multiTurn: Status;
		toolCall: Status;
		toolRoundTrip: Status;
		structuredOutput: Status;
		notes: string[];
	}
> = {};

function getResult(label: string) {
	if (!results[label]) {
		results[label] = {
			chat: "fail",
			multiTurn: "fail",
			toolCall: "fail",
			toolRoundTrip: "fail",
			structuredOutput: "fail",
			notes: [],
		};
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
	console.log("  WORKERS AI BINDING INTEGRATION TEST RESULTS");
	console.log(sep);
	console.log(header);
	console.log(sep);

	for (const label of labels) {
		const r = results[label]!;
		const notes = r.notes.length > 0 ? r.notes.join("; ") : "";
		console.log(
			`${pad(label, maxLabel)} | ${statusIcon(r.chat)} | ${statusIcon(r.multiTurn)} | ${statusIcon(r.toolCall)} | ${statusIcon(r.toolRoundTrip)} | ${statusIcon(r.structuredOutput)} | ${notes}`,
		);
	}

	console.log(sep);
	console.log("  OK = works correctly    ~ = partial/quirky    X = broken/error");
	console.log("  T-RT = tool round-trip (call tool → provide result → model responds)");
	console.log(sep);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** POST JSON to the test worker and parse the response */
async function post(path: string, body: Record<string, unknown> = {}) {
	const res = await fetch(`${BASE}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	return res.json() as Promise<Record<string, unknown>>;
}

/** Find a chunk by type in an array */
function findChunk(chunks: any[], type: string) {
	return chunks.find((c: any) => c.type === type);
}

/** Filter chunks by type */
function filterChunks(chunks: any[], type: string) {
	return chunks.filter((c: any) => c.type === type);
}

/** Wait for a URL to respond with 200 */
async function waitForReady(url: string, timeoutMs = 30_000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(url);
			if (res.ok) return true;
		} catch {
			// Server not ready yet
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	return false;
}

// ---------------------------------------------------------------------------
// Wrangler dev lifecycle
// ---------------------------------------------------------------------------

let wranglerProcess: ChildProcess | null = null;
let serverReady = false;

describe("Workers AI Binding E2E", () => {
	beforeAll(async () => {
		// Start wrangler dev in the background
		wranglerProcess = spawn(
			"pnpm",
			["exec", "wrangler", "dev", "--port", String(PORT), "--log-level", "error"],
			{
				cwd: WORKER_DIR,
				stdio: ["ignore", "pipe", "pipe"],
				env: { ...process.env },
			},
		);

		// Collect stderr for debugging if it fails to start
		let stderr = "";
		wranglerProcess.stderr?.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		wranglerProcess.on("error", (err) => {
			console.error("[binding-e2e] Failed to start wrangler:", err.message);
		});

		// Wait for server to be ready
		serverReady = await waitForReady(`${BASE}/health`, 30_000);
		if (!serverReady) {
			console.error("[binding-e2e] wrangler dev failed to start within 30s");
			if (stderr) console.error("[binding-e2e] stderr:", stderr);
		}
	}, 45_000);

	afterAll(async () => {
		printSummaryTable();
		if (wranglerProcess) {
			wranglerProcess.kill("SIGTERM");
			// Give it a moment to shut down
			await new Promise((r) => setTimeout(r, 1_000));
			if (!wranglerProcess.killed) {
				wranglerProcess.kill("SIGKILL");
			}
			wranglerProcess = null;
		}
	}, 10_000);

	// ------------------------------------------------------------------
	// Per-model: basic chat
	// ------------------------------------------------------------------

	describe("chat (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — basic chat via binding`, async () => {
				if (!serverReady) return;

				const r = getResult(model.label);
				const data = await post("/chat", { model: model.id });
				const chunks = data.chunks as any[];

				if (data.error) {
					r.chat = "fail";
					r.notes.push(`chat: ${(data.error as string).slice(0, 40)}`);
					return;
				}

				const started = findChunk(chunks, "RUN_STARTED");
				const finished = findChunk(chunks, "RUN_FINISHED");
				const content = filterChunks(chunks, "TEXT_MESSAGE_CONTENT");
				const runError = findChunk(chunks, "RUN_ERROR");

				if (runError) {
					r.chat = "fail";
					r.notes.push(`chat: ${runError.error?.message?.slice(0, 40)}`);
					return;
				}

				expect(started).toBeDefined();
				expect(finished).toBeDefined();

				if (content.length > 0) {
					r.chat = "ok";
				} else {
					r.chat = "warn";
					r.notes.push("chat: 0 content chunks");
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Per-model: multi-turn
	// ------------------------------------------------------------------

	describe("multi-turn (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — multi-turn via binding`, async () => {
				if (!serverReady) return;

				const r = getResult(model.label);
				const data = await post("/chat/multi-turn", { model: model.id });
				const chunks = data.chunks as any[];

				if (data.error) {
					r.multiTurn = "fail";
					r.notes.push(`turn: ${(data.error as string).slice(0, 40)}`);
					return;
				}

				const runError = findChunk(chunks, "RUN_ERROR");
				if (runError) {
					r.multiTurn = "fail";
					r.notes.push(`turn: ${runError.error?.message?.slice(0, 40)}`);
					return;
				}

				const content = filterChunks(chunks, "TEXT_MESSAGE_CONTENT");
				if (content.length === 0) {
					r.multiTurn = "warn";
					r.notes.push("turn: no content");
					return;
				}

				const fullText = content[content.length - 1].content;
				if (fullText.toLowerCase().includes("alice")) {
					r.multiTurn = "ok";
				} else {
					r.multiTurn = "warn";
					r.notes.push("turn: forgot context");
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Per-model: tool calling (first round)
	// ------------------------------------------------------------------

	describe("tool call (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — tool call via binding`, async () => {
				if (!serverReady) return;

				const r = getResult(model.label);
				const data = await post("/chat/tool-call", { model: model.id });
				const chunks = data.chunks as any[];

				if (data.error) {
					r.toolCall = "fail";
					r.notes.push(`tool: ${(data.error as string).slice(0, 40)}`);
					return;
				}

				const runError = findChunk(chunks, "RUN_ERROR");
				if (runError) {
					r.toolCall = "fail";
					r.notes.push(`tool: ${runError.error?.message?.slice(0, 40)}`);
					return;
				}

				const toolStarts = filterChunks(chunks, "TOOL_CALL_START");
				const toolEnds = filterChunks(chunks, "TOOL_CALL_END");

				if (toolStarts.length >= 1) {
					// Verify the tool name was correctly parsed
					expect(toolStarts[0].toolName).toBe("calculator");
					r.toolCall = "ok";
				} else {
					const content = filterChunks(chunks, "TEXT_MESSAGE_CONTENT");
					if (content.length > 0) {
						r.toolCall = "warn";
						r.notes.push("tool: answered as text");
					} else {
						r.toolCall = "fail";
						r.notes.push("tool: no tool call or content");
					}
				}

				if (toolStarts.length > 0 && toolEnds.length > 0) {
					// Verify tool call IDs are binding-compatible (9 alphanumeric chars)
					expect(toolStarts[0].toolCallId).toMatch(/^[a-zA-Z0-9]{9}$/);
					expect(toolEnds[0].toolCallId).toMatch(/^[a-zA-Z0-9]{9}$/);
				}
			});
		}
	});

	// ------------------------------------------------------------------
	// Per-model: tool round-trip (the key test for the binding bug fix)
	// ------------------------------------------------------------------

	describe("tool round-trip (per model)", () => {
		for (const model of MODELS) {
			it(`${model.label} — tool round-trip via binding`, async () => {
				if (!serverReady) return;

				const r = getResult(model.label);
				const data = await post("/chat/tool-roundtrip", { model: model.id });

				if (data.error) {
					r.toolRoundTrip = "fail";
					r.notes.push(`t-rt: ${(data.error as string).slice(0, 40)}`);
					return;
				}

				const step1 = data.step1Chunks as any[];
				const step2 = data.step2Chunks as any[] | undefined;

				// Verify step 1 produced a tool call
				const toolStart = findChunk(step1, "TOOL_CALL_START");
				const toolEnd = findChunk(step1, "TOOL_CALL_END");

				if (!toolStart || !toolEnd || !toolEnd.toolName) {
					// Model skipped tool
					const content = filterChunks(step1, "TEXT_MESSAGE_CONTENT");
					if (content.length > 0) {
						r.toolRoundTrip = "warn";
						r.notes.push("t-rt: skipped tool, answered directly");
					} else {
						r.toolRoundTrip = "fail";
						r.notes.push("t-rt: step1 no tool call or content");
					}
					return;
				}

				// Verify step 2 (tool result → text response)
				if (!step2) {
					r.toolRoundTrip = "fail";
					r.notes.push("t-rt: step2 missing");
					return;
				}

				const step2Error = findChunk(step2, "RUN_ERROR");
				if (step2Error) {
					r.toolRoundTrip = "fail";
					r.notes.push(`t-rt: step2 error ${step2Error.error?.message?.slice(0, 30)}`);
					return;
				}

				const step2Content = filterChunks(step2, "TEXT_MESSAGE_CONTENT");
				const step2Finished = findChunk(step2, "RUN_FINISHED");

				if (step2Content.length > 0 && step2Finished) {
					const text = step2Content[step2Content.length - 1].content;
					r.toolRoundTrip = "ok";
					console.log(`  ✓ ${model.label}: binding tool round-trip OK — "${text.slice(0, 80)}"`);
				} else if (step2Finished) {
					r.toolRoundTrip = "fail";
					r.notes.push("t-rt: step2 finished but 0 content");
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
			it(`${model.label} — structured output via binding`, async () => {
				if (!serverReady) return;

				const r = getResult(model.label);
				const data = await post("/chat/structured", { model: model.id });

				if (data.error) {
					r.structuredOutput = "fail";
					r.notes.push(`json: ${(data.error as string).slice(0, 40)}`);
					return;
				}

				const result = data.result as any;
				if (!result) {
					r.structuredOutput = "fail";
					r.notes.push("json: no result");
					return;
				}

				if (typeof result.data === "object" && result.data !== null) {
					const d = result.data;
					if (d.name && d.capital) {
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
});
