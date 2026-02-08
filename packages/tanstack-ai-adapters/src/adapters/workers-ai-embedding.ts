// TODO: Export from index.ts once TanStack AI adds BaseEmbeddingAdapter.
// This adapter is implemented and tested, but held back from the public API
// to avoid shipping a custom interface that would break when TanStack standardizes it.

import type { AiModels, BaseAiTextEmbeddings } from "@cloudflare/workers-types";
import {
	type WorkersAiAdapterConfig,
	type WorkersAiDirectBindingConfig,
	type WorkersAiDirectCredentialsConfig,
	type AiGatewayAdapterConfig,
	createGatewayFetch,
	isDirectBindingConfig,
	isDirectCredentialsConfig,
} from "../utils/create-fetcher";

// ---------------------------------------------------------------------------
// Model type derived from @cloudflare/workers-types
// ---------------------------------------------------------------------------

export type WorkersAiEmbeddingModel = {
	[K in keyof AiModels]: AiModels[K] extends BaseAiTextEmbeddings ? K : never;
}[keyof AiModels];

// ---------------------------------------------------------------------------
// WorkersAiEmbeddingAdapter: embeddings via Workers AI
// ---------------------------------------------------------------------------

export interface WorkersAiEmbeddingResult {
	embeddings: number[][];
}

export class WorkersAiEmbeddingAdapter {
	readonly name = "workers-ai-embedding" as const;
	private model: WorkersAiEmbeddingModel;
	private config: WorkersAiAdapterConfig;

	constructor(model: WorkersAiEmbeddingModel, config: WorkersAiAdapterConfig) {
		this.model = model;
		this.config = config;
	}

	async embed(texts: string[]): Promise<WorkersAiEmbeddingResult> {
		if (isDirectBindingConfig(this.config)) {
			return this.embedViaBinding(texts);
		}

		if (isDirectCredentialsConfig(this.config)) {
			return this.embedViaRest(texts);
		}

		// Gateway mode
		return this.embedViaGateway(texts);
	}

	private async embedViaBinding(texts: string[]): Promise<WorkersAiEmbeddingResult> {
		const ai = (this.config as WorkersAiDirectBindingConfig).binding;
		const result = (await ai.run(this.model, { text: texts })) as {
			shape: number[];
			data: number[][];
		};
		return { embeddings: result.data };
	}

	private async embedViaRest(texts: string[]): Promise<WorkersAiEmbeddingResult> {
		const config = this.config as WorkersAiDirectCredentialsConfig;
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${this.model}`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${config.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ text: texts }),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Workers AI embedding request failed (${response.status}): ${errorText}`,
			);
		}

		const json = (await response.json()) as {
			result: { shape: number[]; data: number[][] };
		};
		return { embeddings: json.result.data };
	}

	private async embedViaGateway(texts: string[]): Promise<WorkersAiEmbeddingResult> {
		const gatewayConfig = this.config as AiGatewayAdapterConfig;
		const gatewayFetch = createGatewayFetch("workers-ai", gatewayConfig);

		// Workers AI expects { text: [...] }, and createGatewayFetch for workers-ai
		// sets endpoint = query.model and strips model from the query.
		const response = await gatewayFetch("https://api.cloudflare.com/v1/embeddings", {
			method: "POST",
			body: JSON.stringify({
				model: this.model,
				text: texts,
			}),
		});

		// Gateway returns Workers AI native format for embeddings
		const json = (await response.json()) as {
			shape: number[];
			data: number[][];
		};

		return { embeddings: json.data };
	}
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

export function createWorkersAiEmbedding(
	model: WorkersAiEmbeddingModel,
	config: WorkersAiAdapterConfig,
) {
	return new WorkersAiEmbeddingAdapter(model, config);
}
