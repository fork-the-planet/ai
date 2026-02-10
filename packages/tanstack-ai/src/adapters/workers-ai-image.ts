// TODO: Rewrite to extend BaseImageAdapter (now exported from @tanstack/ai 0.4.2)
// and export from index.ts. This adapter is implemented and tested, but held back
// from the public API pending a rewrite to the standard interface.

import type { AiModels, BaseAiTextToImage } from "@cloudflare/workers-types";
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

export type WorkersAiImageModel = {
	[K in keyof AiModels]: AiModels[K] extends BaseAiTextToImage ? K : never;
}[keyof AiModels];

// ---------------------------------------------------------------------------
// WorkersAiImageAdapter: image generation via Workers AI
// ---------------------------------------------------------------------------

export interface WorkersAiImageResult {
	/** Base64-encoded image data */
	image: string;
}

export class WorkersAiImageAdapter {
	readonly name = "workers-ai-image" as const;
	private model: WorkersAiImageModel;
	private config: WorkersAiAdapterConfig;

	constructor(model: WorkersAiImageModel, config: WorkersAiAdapterConfig) {
		this.model = model;
		this.config = config;
	}

	async generate(
		prompt: string,
		options?: Record<string, unknown>,
	): Promise<WorkersAiImageResult> {
		if (isDirectBindingConfig(this.config)) {
			return this.generateViaBinding(prompt, options);
		}

		if (isDirectCredentialsConfig(this.config)) {
			return this.generateViaRest(prompt, options);
		}

		// Gateway mode
		return this.generateViaGateway(prompt, options);
	}

	private async generateViaBinding(
		prompt: string,
		options?: Record<string, unknown>,
	): Promise<WorkersAiImageResult> {
		const ai = (this.config as WorkersAiDirectBindingConfig).binding;
		const result = await ai.run(this.model, { prompt, ...options });

		// Workers AI image models return raw binary (Uint8Array) or a ReadableStream
		if (result instanceof ReadableStream) {
			const reader = result.getReader();
			const chunks: Uint8Array[] = [];
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
			}
			const combined = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
			let offset = 0;
			for (const chunk of chunks) {
				combined.set(chunk, offset);
				offset += chunk.length;
			}
			return { image: uint8ArrayToBase64(combined) };
		}

		if (result instanceof Uint8Array || result instanceof ArrayBuffer) {
			const bytes = result instanceof ArrayBuffer ? new Uint8Array(result) : result;
			return { image: uint8ArrayToBase64(bytes) };
		}

		// Some models may return { image: "base64..." }
		if (typeof result === "object" && result !== null && "image" in result) {
			return { image: (result as { image: string }).image };
		}

		throw new Error("Unexpected response format from Workers AI image model");
	}

	private async generateViaRest(
		prompt: string,
		options?: Record<string, unknown>,
	): Promise<WorkersAiImageResult> {
		const config = this.config as WorkersAiDirectCredentialsConfig;
		const response = await fetch(
			`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${this.model}`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${config.apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ prompt, ...options }),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`Workers AI image request failed (${response.status}): ${errorText}`);
		}

		// Workers AI REST returns the raw image bytes
		const buffer = await response.arrayBuffer();
		return { image: uint8ArrayToBase64(new Uint8Array(buffer)) };
	}

	private async generateViaGateway(
		prompt: string,
		options?: Record<string, unknown>,
	): Promise<WorkersAiImageResult> {
		const gatewayConfig = this.config as AiGatewayAdapterConfig;
		const gatewayFetch = createGatewayFetch("workers-ai", gatewayConfig);

		const response = await gatewayFetch("https://api.cloudflare.com/v1/images/generations", {
			method: "POST",
			body: JSON.stringify({
				model: this.model,
				prompt,
				...options,
			}),
		});

		const buffer = await response.arrayBuffer();
		return { image: uint8ArrayToBase64(new Uint8Array(buffer)) };
	}
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

export function createWorkersAiImage(model: WorkersAiImageModel, config: WorkersAiAdapterConfig) {
	return new WorkersAiImageAdapter(model, config);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function uint8ArrayToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]!);
	}
	return btoa(binary);
}
