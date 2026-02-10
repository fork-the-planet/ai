import type { AiModels, BaseAiTextGeneration } from "@cloudflare/workers-types";
import type { StreamChunk, TextOptions } from "@tanstack/ai";
import {
	BaseTextAdapter,
	type StructuredOutputOptions,
	type StructuredOutputResult,
} from "@tanstack/ai/adapters";
import OpenAI from "openai";
import {
	type WorkersAiAdapterConfig,
	type AiGatewayAdapterConfig,
	createGatewayFetch,
	createWorkersAiBindingFetch,
	isDirectBindingConfig,
	isDirectCredentialsConfig,
} from "../utils/create-fetcher";

// ---------------------------------------------------------------------------
// Model types derived from @cloudflare/workers-types
// ---------------------------------------------------------------------------

export type WorkersAiTextModel = {
	[K in keyof AiModels]: AiModels[K] extends BaseAiTextGeneration ? K : never;
}[keyof AiModels];

// ---------------------------------------------------------------------------
// Helpers: build the right OpenAI client depending on config mode
// ---------------------------------------------------------------------------

function buildWorkersAiClient(config: WorkersAiAdapterConfig): OpenAI {
	if (isDirectBindingConfig(config)) {
		// Plain binding mode: shim translates OpenAI fetch calls to env.AI.run()
		return new OpenAI({
			apiKey: "unused",
			fetch: createWorkersAiBindingFetch(config.binding),
		});
	}

	if (isDirectCredentialsConfig(config)) {
		// Plain REST mode: point OpenAI SDK at Workers AI's OpenAI-compatible endpoint
		return new OpenAI({
			baseURL: `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/v1`,
			apiKey: config.apiKey,
		});
	}

	// Gateway mode (existing): use createGatewayFetch
	const gatewayConfig = config as AiGatewayAdapterConfig;
	return new OpenAI({
		fetch: createGatewayFetch("workers-ai", gatewayConfig),
		apiKey: gatewayConfig.apiKey ?? "unused",
	});
}

// ---------------------------------------------------------------------------
// Shared message-building helpers
// ---------------------------------------------------------------------------

interface MessageLike {
	role: string;
	content: string | null | Array<{ type: string; content?: string }>;
	toolCalls?: Array<{
		id: string;
		function: { name: string; arguments: string };
	}>;
	toolCallId?: string;
}

function extractTextContent(
	content: string | null | Array<{ type: string; content?: string }>,
): string {
	if (content === null) return "";
	if (typeof content === "string") return content;
	return content
		.filter((p) => p.type === "text")
		.map((p) => p.content || "")
		.join("");
}

function buildOpenAIMessages(
	systemPrompts: string[] | undefined,
	messages: MessageLike[],
	options?: { includeToolMessages?: boolean },
): OpenAI.Chat.ChatCompletionMessageParam[] {
	const includeTools = options?.includeToolMessages ?? true;
	const openAIMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

	if (systemPrompts && systemPrompts.length > 0) {
		openAIMessages.push({
			role: "system",
			content: systemPrompts.join("\n"),
		});
	}

	for (const message of messages) {
		if (message.role === "user") {
			openAIMessages.push({
				role: "user",
				content: extractTextContent(message.content),
			});
		} else if (message.role === "assistant") {
			const assistantMessage: OpenAI.Chat.ChatCompletionAssistantMessageParam = {
				role: "assistant",
				content: extractTextContent(message.content),
			};
			if (includeTools && message.toolCalls && message.toolCalls.length > 0) {
				assistantMessage.tool_calls = message.toolCalls.map((tc) => ({
					id: tc.id,
					type: "function" as const,
					function: {
						name: tc.function.name,
						arguments: tc.function.arguments,
					},
				}));
			}
			openAIMessages.push(assistantMessage);
		} else if (includeTools && message.role === "tool") {
			let toolContent: string;
			if (typeof message.content === "string") {
				try {
					JSON.parse(message.content);
					toolContent = message.content;
				} catch {
					toolContent = JSON.stringify(message.content);
				}
			} else {
				toolContent = JSON.stringify(message.content);
			}
			openAIMessages.push({
				role: "tool",
				tool_call_id: message.toolCallId || `tool_${crypto.randomUUID().slice(0, 8)}`,
				content: toolContent,
			});
		}
	}

	return openAIMessages;
}

function buildOpenAITools(
	tools: Array<{ name: string; description: string; inputSchema?: unknown }> | undefined,
): OpenAI.Chat.ChatCompletionTool[] | undefined {
	if (!tools) return undefined;
	return tools.map((tool) => ({
		type: "function" as const,
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.inputSchema as Record<string, unknown>,
		},
	}));
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function generateId(prefix: string): string {
	return `${prefix}-${crypto.randomUUID()}`;
}

// ---------------------------------------------------------------------------
// WorkersAiTextAdapter: chat / structured output via OpenAI Chat Completions
// ---------------------------------------------------------------------------

// TODO: Replace `any` generic params with proper types once BaseTextAdapter's
// provider-options generics stabilize. Workers AI doesn't have provider-specific
// options in the TanStack sense, so `any` is pragmatic for now.
export class WorkersAiTextAdapter<TModel extends WorkersAiTextModel> extends BaseTextAdapter<
	TModel,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- BaseTextAdapter generic params are opaque
	any,
	any,
	any
> {
	name = "workers-ai" as const;

	private client: OpenAI;

	constructor(model: TModel, config: WorkersAiAdapterConfig) {
		super({ apiKey: "unused" }, model);
		this.client = buildWorkersAiClient(config);
	}

	async *chatStream(options: TextOptions<any>): AsyncIterable<StreamChunk> {
		const { systemPrompts, messages, tools, temperature, model } = options;

		const openAIMessages = buildOpenAIMessages(systemPrompts, messages);
		const openAITools = buildOpenAITools(tools);

		const timestamp = Date.now();
		const runId = generateId("workers-ai");
		const messageId = generateId("workers-ai");
		let hasEmittedRunStarted = false;
		let hasEmittedTextMessageStart = false;
		let accumulatedContent = "";
		const toolCallsInProgress = new Map<
			number,
			{ id: string; name: string; arguments: string; started: boolean }
		>();

		try {
			const stream = await this.client.chat.completions.create({
				model: model ?? this.model,
				messages: openAIMessages,
				tools: openAITools,
				temperature,
				stream: true,
				stream_options: { include_usage: true },
			});

			for await (const chunk of stream) {
				if (!chunk.choices || chunk.choices.length === 0) continue;
				const choice = chunk.choices[0];
				if (!choice) continue;

				// Emit RUN_STARTED on first chunk
				if (!hasEmittedRunStarted) {
					hasEmittedRunStarted = true;
					yield {
						type: "RUN_STARTED",
						runId,
						model: chunk.model || model || this.model,
						timestamp,
					} satisfies StreamChunk;
				}

				const delta = choice.delta;

				// Text content
				if (delta.content) {
					if (!hasEmittedTextMessageStart) {
						hasEmittedTextMessageStart = true;
						yield {
							type: "TEXT_MESSAGE_START",
							messageId,
							model: chunk.model || model || this.model,
							timestamp,
							role: "assistant",
						} satisfies StreamChunk;
					}

					accumulatedContent += delta.content;
					yield {
						type: "TEXT_MESSAGE_CONTENT",
						messageId,
						model: chunk.model || model || this.model,
						timestamp,
						delta: delta.content,
						content: accumulatedContent,
					} satisfies StreamChunk;
				}

				// Tool calls
				if (delta.tool_calls) {
					for (const toolCallDelta of delta.tool_calls) {
						const index = toolCallDelta.index;

						if (!toolCallsInProgress.has(index)) {
							toolCallsInProgress.set(index, {
								id: toolCallDelta.id || "",
								name: toolCallDelta.function?.name || "",
								arguments: "",
								started: false,
							});
						}

						const toolCall = toolCallsInProgress.get(index)!;

						if (toolCallDelta.id) {
							toolCall.id = toolCallDelta.id;
						}
						if (toolCallDelta.function?.name) {
							toolCall.name = toolCallDelta.function.name;
						}
						if (toolCallDelta.function?.arguments) {
							toolCall.arguments += toolCallDelta.function.arguments;
						}

						// Emit TOOL_CALL_START once we have id and name
						if (toolCall.id && toolCall.name && !toolCall.started) {
							toolCall.started = true;
							yield {
								type: "TOOL_CALL_START",
								toolCallId: toolCall.id,
								toolName: toolCall.name,
								model: chunk.model || model || this.model,
								timestamp,
								index,
							} satisfies StreamChunk;
						}

						// Stream tool call arguments
						if (toolCallDelta.function?.arguments && toolCall.started) {
							yield {
								type: "TOOL_CALL_ARGS",
								toolCallId: toolCall.id,
								model: chunk.model || model || this.model,
								timestamp,
								delta: toolCallDelta.function.arguments,
							} satisfies StreamChunk;
						}
					}
				}

				// Finish
				if (choice.finish_reason) {
					// End tool calls
					if (choice.finish_reason === "tool_calls" || toolCallsInProgress.size > 0) {
						for (const [, toolCall] of toolCallsInProgress) {
							let parsedInput: unknown = {};
							try {
								parsedInput = toolCall.arguments
									? JSON.parse(toolCall.arguments)
									: {};
							} catch {
								parsedInput = {};
							}
							yield {
								type: "TOOL_CALL_END",
								toolCallId: toolCall.id,
								toolName: toolCall.name,
								model: chunk.model || model || this.model,
								timestamp,
								input: parsedInput,
							} satisfies StreamChunk;
						}
					}

					const computedFinishReason =
						choice.finish_reason === "tool_calls" ||
						choice.finish_reason === "function_call" ||
						toolCallsInProgress.size > 0
							? "tool_calls"
							: (choice.finish_reason as "stop" | "length" | "content_filter");

					// End text message if started
					if (hasEmittedTextMessageStart) {
						yield {
							type: "TEXT_MESSAGE_END",
							messageId,
							model: chunk.model || model || this.model,
							timestamp,
						} satisfies StreamChunk;
					}

					// Emit RUN_FINISHED
					yield {
						type: "RUN_FINISHED",
						runId,
						model: chunk.model || model || this.model,
						timestamp,
						usage: chunk.usage
							? {
									promptTokens: chunk.usage.prompt_tokens,
									completionTokens: chunk.usage.completion_tokens,
									totalTokens: chunk.usage.total_tokens,
								}
							: undefined,
						finishReason: computedFinishReason,
					} satisfies StreamChunk;
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const code =
				error instanceof Error ? (error as Error & { code?: string }).code : undefined;
			if (!hasEmittedRunStarted) {
				yield {
					type: "RUN_STARTED",
					runId,
					model: model ?? this.model,
					timestamp,
				} satisfies StreamChunk;
			}
			yield {
				type: "RUN_ERROR",
				runId,
				model: model ?? this.model,
				timestamp,
				error: {
					message: message || "Unknown error",
					code,
				},
			} satisfies StreamChunk;
		}
	}

	async structuredOutput(
		options: StructuredOutputOptions<any>,
	): Promise<StructuredOutputResult<unknown>> {
		const { outputSchema, chatOptions } = options;
		const { systemPrompts, messages, temperature, model } = chatOptions;

		const openAIMessages = buildOpenAIMessages(systemPrompts, messages, {
			includeToolMessages: false,
		});

		const response = await this.client.chat.completions.create({
			model: model ?? this.model,
			messages: openAIMessages,
			temperature,
			stream: false,
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "structured_output",
					strict: true,
					schema: outputSchema,
				},
			},
		});

		const choice = response.choices?.[0];

		if (!choice) {
			throw new Error(
				`Workers AI structured output returned no choices: ${JSON.stringify(response)}`,
			);
		}

		const rawContent = choice.message?.content ?? "";

		// Workers AI REST endpoint may return `content` as an already-parsed object
		// when using json_schema response format, so normalise both cases.
		let data: unknown;
		let rawText: string;

		if (typeof rawContent === "string") {
			rawText = rawContent;
			try {
				data = JSON.parse(rawText);
			} catch {
				data = rawText;
			}
		} else {
			// Already an object — stringify for rawText, use directly for data
			data = rawContent;
			rawText = JSON.stringify(rawContent);
		}

		return { data, rawText };
	}
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export function createWorkersAiChat(model: WorkersAiTextModel, config: WorkersAiAdapterConfig) {
	return new WorkersAiTextAdapter(model, config);
}
