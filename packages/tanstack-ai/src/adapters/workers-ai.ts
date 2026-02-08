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
				tool_call_id: message.toolCallId || "",
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
// WorkersAiTextAdapter: chat / structured output via OpenAI Chat Completions
// ---------------------------------------------------------------------------

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

		const stream = await this.client.chat.completions.create({
			model: model || this.model,
			messages: openAIMessages,
			tools: openAITools,
			temperature,
			stream: true,
		});

		const timestamp = Date.now();
		const responseId = `workers-ai-${timestamp}`;
		let accumulatedContent = "";
		const toolCallsMap = new Map<number, { id: string; name: string; arguments: string }>();
		let finishReason: "stop" | "length" | "tool_calls" | "content_filter" | null = null;
		let usage:
			| {
					promptTokens: number;
					completionTokens: number;
					totalTokens: number;
			  }
			| undefined;

		for await (const chunk of stream) {
			if (!chunk.choices || chunk.choices.length === 0) continue;
			const choice = chunk.choices[0];
			if (!choice) continue;

			const delta = choice.delta;

			if (delta.content) {
				accumulatedContent += delta.content;
				yield {
					type: "content",
					id: responseId,
					model: model || this.model,
					timestamp,
					delta: delta.content,
					content: accumulatedContent,
					role: "assistant",
				} satisfies StreamChunk;
			}

			if (delta.tool_calls) {
				for (const toolCallDelta of delta.tool_calls) {
					const index = toolCallDelta.index;
					let existing = toolCallsMap.get(index);

					if (!existing) {
						existing = {
							id: toolCallDelta.id || "",
							name: toolCallDelta.function?.name || "",
							arguments: "",
						};
						toolCallsMap.set(index, existing);
					}

					if (toolCallDelta.id) {
						existing.id = toolCallDelta.id;
					}
					if (toolCallDelta.function?.name) {
						existing.name = toolCallDelta.function.name;
					}
					if (toolCallDelta.function?.arguments) {
						existing.arguments += toolCallDelta.function.arguments;
					}
				}
			}

			if (choice.finish_reason) {
				const reason = choice.finish_reason;
				finishReason = reason === "function_call" ? "tool_calls" : reason;
			}

			if (chunk.usage) {
				usage = {
					promptTokens: chunk.usage.prompt_tokens,
					completionTokens: chunk.usage.completion_tokens,
					totalTokens: chunk.usage.total_tokens,
				};
			}
		}

		for (const [index, toolCall] of toolCallsMap) {
			yield {
				type: "tool_call",
				id: responseId,
				model: model || this.model,
				timestamp,
				index,
				toolCall: {
					id: toolCall.id,
					type: "function",
					function: {
						name: toolCall.name,
						arguments: toolCall.arguments,
					},
				},
			} satisfies StreamChunk;
		}

		yield {
			type: "done",
			id: responseId,
			model: model || this.model,
			timestamp,
			finishReason,
			usage,
		} satisfies StreamChunk;
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
			model: model || this.model,
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

		const rawText = choice.message?.content || "";

		let data: unknown;
		try {
			data = JSON.parse(rawText);
		} catch {
			data = rawText;
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
