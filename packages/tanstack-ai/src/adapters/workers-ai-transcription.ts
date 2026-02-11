import { BaseTranscriptionAdapter } from "@tanstack/ai/adapters";
import type { TranscriptionOptions, TranscriptionResult } from "@tanstack/ai";
import {
	type WorkersAiAdapterConfig,
	type WorkersAiDirectBindingConfig,
	type WorkersAiDirectCredentialsConfig,
	type AiGatewayAdapterConfig,
	createGatewayFetch,
	isDirectBindingConfig,
	isDirectCredentialsConfig,
} from "../utils/create-fetcher";
import { workersAiRestFetch } from "../utils/workers-ai-rest";
import { uint8ArrayToBase64 } from "../utils/binary";

// ---------------------------------------------------------------------------
// Model types
// ---------------------------------------------------------------------------

/**
 * Workers AI models that support speech-to-text transcription.
 *
 * Note: the typed `AiModels` interface in `@cloudflare/workers-types` may lag
 * behind what's deployed. We use a string union here that matches the known
 * models including Deepgram partner models.
 */
export type WorkersAiTranscriptionModel =
	| "@cf/openai/whisper"
	| "@cf/openai/whisper-tiny-en"
	| "@cf/openai/whisper-large-v3-turbo"
	| "@cf/deepgram/nova-3";

// ---------------------------------------------------------------------------
// WorkersAiTranscriptionAdapter
// ---------------------------------------------------------------------------

export class WorkersAiTranscriptionAdapter extends BaseTranscriptionAdapter<WorkersAiTranscriptionModel> {
	readonly name = "workers-ai-transcription" as const;
	private adapterConfig: WorkersAiAdapterConfig;

	constructor(config: WorkersAiAdapterConfig, model: WorkersAiTranscriptionModel) {
		super({}, model);
		this.adapterConfig = config;
	}

	async transcribe(options: TranscriptionOptions): Promise<TranscriptionResult> {
		const { audio, language, prompt, modelOptions } = options;

		// Normalize audio to a format Workers AI accepts
		const audioData = await normalizeAudio(audio);

		const extra: Record<string, unknown> = { ...modelOptions };
		if (language) extra.language = language;
		if (prompt) extra.initial_prompt = prompt;

		if (isDirectBindingConfig(this.adapterConfig)) {
			return this.transcribeViaBinding(audioData, extra);
		}

		if (isDirectCredentialsConfig(this.adapterConfig)) {
			return this.transcribeViaRest(audioData, extra);
		}

		return this.transcribeViaGateway(audioData, extra);
	}

	private async transcribeViaBinding(
		audio: number[],
		options: Record<string, unknown>,
	): Promise<TranscriptionResult> {
		const ai = (this.adapterConfig as WorkersAiDirectBindingConfig).binding;
		// Workers AI whisper models accept { audio: number[] }
		const result = (await ai.run(this.model, { audio, ...options })) as Record<string, unknown>;
		return this.normalizeResult(result);
	}

	private async transcribeViaRest(
		audio: number[],
		options: Record<string, unknown>,
	): Promise<TranscriptionResult> {
		const config = this.adapterConfig as WorkersAiDirectCredentialsConfig;

		// For whisper-large-v3-turbo, REST API accepts base64 string
		const audioPayload =
			this.model === "@cf/openai/whisper-large-v3-turbo"
				? { audio: uint8ArrayToBase64(new Uint8Array(audio)), ...options }
				: { audio, ...options };

		const response = await workersAiRestFetch(config, this.model, audioPayload, {
			label: "Workers AI transcription",
			signal: (options as { signal?: AbortSignal }).signal,
		});

		const data = (await response.json()) as {
			result?: Record<string, unknown>;
		} & Record<string, unknown>;

		// Cloudflare REST API wraps responses in { success, result: {...} }.
		// Use `data.result` when present, fall back to `data` for direct responses.
		return this.normalizeResult(data.result ?? data);
	}

	private async transcribeViaGateway(
		audio: number[],
		options: Record<string, unknown>,
	): Promise<TranscriptionResult> {
		const gatewayConfig = this.adapterConfig as AiGatewayAdapterConfig;
		const gatewayFetch = createGatewayFetch("workers-ai", gatewayConfig);

		const audioPayload =
			this.model === "@cf/openai/whisper-large-v3-turbo"
				? { audio: uint8ArrayToBase64(new Uint8Array(audio)), ...options }
				: { audio, ...options };

		// The URL here is a placeholder — createGatewayFetch for "workers-ai" extracts
		// the model from the body, sets it as the endpoint, and routes through the gateway.
		// The actual URL path is not used.
		const response = await gatewayFetch("https://api.cloudflare.com/v1/audio/transcriptions", {
			method: "POST",
			body: JSON.stringify({
				model: this.model,
				...audioPayload,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`Workers AI transcription gateway request failed (${response.status}): ${errorText}`,
			);
		}

		const data = (await response.json()) as Record<string, unknown>;
		return this.normalizeResult(data);
	}

	/**
	 * Normalize Workers AI transcription results into the standard
	 * TanStack AI TranscriptionResult shape.
	 */
	private normalizeResult(raw: Record<string, unknown>): TranscriptionResult {
		// Workers AI returns { text, words?, vtt? } for basic whisper,
		// and { text, segments?, transcription_info?, word_count?, vtt? } for v3-turbo
		const result: TranscriptionResult = {
			id: this.generateId(),
			model: this.model,
			text: (raw.text as string) ?? "",
		};

		// Language from transcription_info (whisper-large-v3-turbo)
		const transcriptionInfo = raw.transcription_info as Record<string, unknown> | undefined;
		if (transcriptionInfo?.language) {
			result.language = transcriptionInfo.language as string;
		}

		// Duration
		if (transcriptionInfo?.duration != null) {
			result.duration = transcriptionInfo.duration as number;
		}

		// Segments (whisper-large-v3-turbo returns these)
		if (raw.segments && Array.isArray(raw.segments)) {
			result.segments = raw.segments.map((seg: Record<string, unknown>, idx: number) => ({
				id: idx,
				text: (seg.text as string) ?? "",
				start: (seg.start as number) ?? 0,
				end: (seg.end as number) ?? 0,
			}));
		}

		// Words — basic whisper returns top-level words[], v3-turbo nests them in segments
		if (raw.words && Array.isArray(raw.words)) {
			result.words = raw.words.map((w: Record<string, unknown>) => ({
				word: (w.word as string) ?? "",
				start: (w.start as number) ?? 0,
				end: (w.end as number) ?? 0,
			}));
		}

		return result;
	}
}

// ---------------------------------------------------------------------------
// Factory function
// ---------------------------------------------------------------------------

/**
 * Creates a Workers AI transcription adapter for speech-to-text.
 *
 * Works with TanStack AI's `generateTranscription()` activity function:
 * ```ts
 * import { generateTranscription } from "@tanstack/ai";
 * import { createWorkersAiTranscription } from "@cloudflare/tanstack-ai";
 *
 * const adapter = createWorkersAiTranscription(
 *   "@cf/openai/whisper-large-v3-turbo",
 *   { binding: env.AI },
 * );
 *
 * const result = await generateTranscription({ adapter, audio: audioData });
 * // result.text — the transcribed text
 * ```
 *
 * Note: Factory takes `(model, config)` for ergonomics — the class constructor
 * uses `(config, model)` to match TanStack AI's upstream convention.
 */
export function createWorkersAiTranscription(
	model: WorkersAiTranscriptionModel,
	config: WorkersAiAdapterConfig,
) {
	return new WorkersAiTranscriptionAdapter(config, model);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Normalize various audio input formats into a number[] that
 * Workers AI binding accepts.
 *
 * Note: `File extends Blob`, so `File` instances are handled by the
 * `instanceof Blob` branch. `Blob.arrayBuffer()` always reads the full
 * contents regardless of any prior reads — there's no cursor to worry about.
 */
async function normalizeAudio(audio: string | File | Blob | ArrayBuffer): Promise<number[]> {
	if (audio instanceof ArrayBuffer) {
		return Array.from(new Uint8Array(audio));
	}

	if (audio instanceof Blob) {
		// This also handles `File` (which extends Blob)
		const buffer = await audio.arrayBuffer();
		return Array.from(new Uint8Array(buffer));
	}

	if (typeof audio === "string") {
		// Assume base64 string — decode to bytes
		const binary = atob(audio);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return Array.from(bytes);
	}

	throw new Error("Unsupported audio format. Expected string, File, Blob, or ArrayBuffer.");
}
