import { describe, expect, it, vi } from "vitest";
import { createWorkersAiBindingFetch } from "../src/utils/create-fetcher";

// ---------------------------------------------------------------------------
// createWorkersAiBindingFetch (binding shim)
// ---------------------------------------------------------------------------

describe("createWorkersAiBindingFetch", () => {
	it("should translate non-streaming request to OpenAI-compatible response", async () => {
		const mockBinding = {
			run: vi.fn().mockResolvedValue({ response: "Hello from Workers AI!" }),
		};

		const fetcher = createWorkersAiBindingFetch(mockBinding);

		const response = await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [{ role: "user", content: "Hi" }],
				temperature: 0.7,
			}),
		});

		// Check binding was called correctly
		expect(mockBinding.run).toHaveBeenCalledOnce();
		const [model, inputs] = mockBinding.run.mock.calls[0];
		expect(model).toBe("@cf/meta/llama-3.3-70b-instruct-fp8-fast");
		expect(inputs.messages).toEqual([{ role: "user", content: "Hi" }]);
		expect(inputs.temperature).toBe(0.7);
		expect(inputs.stream).toBeUndefined();

		// Check response is OpenAI-compatible
		const json = (await response.json()) as {
			choices: Array<{
				message: { content: string; role: string };
				finish_reason: string;
			}>;
		};
		expect(json.choices[0].message.content).toBe("Hello from Workers AI!");
		expect(json.choices[0].message.role).toBe("assistant");
		expect(json.choices[0].finish_reason).toBe("stop");
	});

	it("should handle tool calls in non-streaming response", async () => {
		const mockBinding = {
			run: vi.fn().mockResolvedValue({
				response: "",
				tool_calls: [
					{
						name: "get_weather",
						arguments: { location: "San Francisco" },
					},
				],
			}),
		};

		const fetcher = createWorkersAiBindingFetch(mockBinding);

		const response = await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [{ role: "user", content: "What's the weather in SF?" }],
				tools: [
					{
						type: "function",
						function: { name: "get_weather", parameters: {} },
					},
				],
			}),
		});

		const json = (await response.json()) as {
			choices: Array<{
				message: {
					role: string;
					content: string;
					tool_calls?: Array<{
						id: string;
						type: string;
						function: { name: string; arguments: string };
					}>;
				};
				finish_reason: string;
			}>;
		};
		expect(json.choices[0].finish_reason).toBe("tool_calls");
		expect(json.choices[0].message.tool_calls).toHaveLength(1);
		expect(json.choices[0].message.tool_calls![0].function.name).toBe("get_weather");
		expect(JSON.parse(json.choices[0].message.tool_calls![0].function.arguments)).toEqual({
			location: "San Francisco",
		});
	});

	it("should translate streaming request and return SSE response", async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode('data: {"response":"Hello"}\n\n'));
				controller.enqueue(encoder.encode('data: {"response":" world"}\n\n'));
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			},
		});

		const mockBinding = {
			run: vi.fn().mockResolvedValue(stream),
		};

		const fetcher = createWorkersAiBindingFetch(mockBinding);

		const response = await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [{ role: "user", content: "Hi" }],
				stream: true,
			}),
		});

		expect(response.headers.get("Content-Type")).toBe("text/event-stream");

		// Read the transformed stream
		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let text = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			text += decoder.decode(value, { stream: true });
		}

		// Should contain OpenAI-formatted SSE events
		expect(text).toContain('"object":"chat.completion.chunk"');
		expect(text).toContain('"content":"Hello"');
		expect(text).toContain('"content":" world"');
		expect(text).toContain('"finish_reason":"stop"');

		// Should contain exactly one [DONE] (not duplicated)
		const doneCount = (text.match(/data: \[DONE\]/g) || []).length;
		expect(doneCount).toBe(1);
	});

	it("should use stable stream ID across all chunks", async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode('data: {"response":"Hello"}\n\n'));
				controller.enqueue(encoder.encode('data: {"response":" world"}\n\n'));
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			},
		});

		const mockBinding = {
			run: vi.fn().mockResolvedValue(stream),
		};

		const fetcher = createWorkersAiBindingFetch(mockBinding);

		const response = await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [{ role: "user", content: "Hi" }],
				stream: true,
			}),
		});

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let text = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			text += decoder.decode(value, { stream: true });
		}

		// Extract all IDs from the SSE events
		const ids = [...text.matchAll(/"id":"(workers-ai-\d+)"/g)].map((m) => m[1]);
		expect(ids.length).toBeGreaterThanOrEqual(3); // 2 content chunks + 1 finish chunk
		// All IDs should be identical
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(1);
	});

	it("should handle tool calls in streaming response", async () => {
		const encoder = new TextEncoder();
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(
					encoder.encode(
						'data: {"response":"","tool_calls":[{"name":"add","arguments":{"a":1,"b":2}}]}\n\n',
					),
				);
				controller.enqueue(encoder.encode("data: [DONE]\n\n"));
				controller.close();
			},
		});

		const mockBinding = {
			run: vi.fn().mockResolvedValue(stream),
		};

		const fetcher = createWorkersAiBindingFetch(mockBinding);

		const response = await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [],
				stream: true,
				tools: [
					{
						type: "function",
						function: { name: "add", parameters: {} },
					},
				],
			}),
		});

		const reader = response.body!.getReader();
		const decoder = new TextDecoder();
		let text = "";
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			text += decoder.decode(value, { stream: true });
		}

		// Should contain tool call delta
		expect(text).toContain('"tool_calls"');
		expect(text).toContain('"name":"add"');
		// Finish reason should be tool_calls
		expect(text).toContain('"finish_reason":"tool_calls"');
	});

	it("should pass tools to binding when provided", async () => {
		const mockBinding = {
			run: vi.fn().mockResolvedValue({ response: "ok" }),
		};

		const fetcher = createWorkersAiBindingFetch(mockBinding);

		await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [],
				tools: [
					{
						type: "function",
						function: { name: "add", parameters: {} },
					},
				],
			}),
		});

		const [, inputs] = mockBinding.run.mock.calls[0];
		expect(inputs.tools).toEqual([
			{ type: "function", function: { name: "add", parameters: {} } },
		]);
	});

	it("should return 400 when no body is provided", async () => {
		const mockBinding = { run: vi.fn() };
		const fetcher = createWorkersAiBindingFetch(mockBinding);

		const response = await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
		});

		expect(response.status).toBe(400);
		expect(mockBinding.run).not.toHaveBeenCalled();
	});

	it("should pass response_format to binding for structured output", async () => {
		const mockBinding = {
			run: vi.fn().mockResolvedValue({ response: '{"name":"test"}' }),
		};

		const fetcher = createWorkersAiBindingFetch(mockBinding);

		await fetcher("https://api.openai.com/v1/chat/completions", {
			method: "POST",
			body: JSON.stringify({
				model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
				messages: [],
				response_format: {
					type: "json_schema",
					json_schema: { name: "test", schema: {} },
				},
			}),
		});

		const [, inputs] = mockBinding.run.mock.calls[0];
		expect(inputs.response_format).toEqual({
			type: "json_schema",
			json_schema: { name: "test", schema: {} },
		});
	});
});
