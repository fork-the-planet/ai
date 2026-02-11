/**
 * The names of the BaseAiTextGeneration models.
 */
export type TextGenerationModels = Exclude<
	value2key<AiModels, BaseAiTextGeneration>,
	value2key<AiModels, BaseAiTextToImage>
>; // This needs to be fixed to allow more models

/*
 * The names of the BaseAiTextToImage models.
 */
export type ImageGenerationModels = value2key<AiModels, BaseAiTextToImage>;

/**
 * The names of the BaseAiTextToEmbeddings models.
 */
export type EmbeddingModels = value2key<AiModels, BaseAiTextEmbeddings>;

/**
 * Workers AI models that support speech-to-text transcription.
 *
 * Includes Whisper variants from `@cloudflare/workers-types` plus
 * Deepgram partner models that may not be in the typed interface yet.
 */
export type TranscriptionModels =
	| value2key<AiModels, BaseAiAutomaticSpeechRecognition>
	| "@cf/deepgram/nova-3";

/**
 * Workers AI models that support text-to-speech.
 *
 * Includes models from `@cloudflare/workers-types` plus Deepgram partner
 * models that may not be in the typed interface yet.
 */
export type SpeechModels = value2key<AiModels, BaseAiTextToSpeech> | "@cf/deepgram/aura-1";

/**
 * Workers AI models that support reranking.
 */
export type RerankingModels = "@cf/baai/bge-reranker-base" | "@cf/baai/bge-reranker-v2-m3";

type value2key<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];
