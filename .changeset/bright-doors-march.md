---
"workers-ai-provider": minor
---

Add transcription, text-to-speech, and reranking support to the Workers AI provider.

### New capabilities

- **Transcription** (`provider.transcription(model)`) — implements `TranscriptionModelV3`. Supports Whisper models (`@cf/openai/whisper`, `whisper-tiny-en`, `whisper-large-v3-turbo`) and Deepgram Nova-3 (`@cf/deepgram/nova-3`). Handles model-specific input formats: number arrays for basic Whisper, base64 for v3-turbo via REST, and `{ body, contentType }` for Nova-3 via binding or raw binary upload for Nova-3 via REST.

- **Speech / TTS** (`provider.speech(model)`) — implements `SpeechModelV3`. Supports Workers AI TTS models including Deepgram Aura-1 (`@cf/deepgram/aura-1`). Accepts `text`, `voice`, and `speed` options. Returns audio as `Uint8Array`. Uses `returnRawResponse` to handle binary audio from the REST path without JSON parsing.

- **Reranking** (`provider.reranking(model)`) — implements `RerankingModelV3`. Supports BGE reranker models (`@cf/baai/bge-reranker-base`, `bge-reranker-v2-m3`). Converts AI SDK's document format to Workers AI's `{ query, contexts, top_k }` input. Handles both text and JSON object documents.

### Bug fixes

- **AbortSignal passthrough** — `createRun` REST shim now passes the abort signal to `fetch`, enabling request cancellation and timeout handling. Previously the signal was silently dropped.
- **Nova-3 REST support** — Added `createRunBinary` utility for models that require raw binary upload instead of JSON (used by Nova-3 transcription via REST).

### Usage

```typescript
import { createWorkersAI } from "workers-ai-provider";
import { experimental_transcribe, experimental_generateSpeech, rerank } from "ai";

const workersai = createWorkersAI({ binding: env.AI });

// Transcription
const transcript = await experimental_transcribe({
	model: workersai.transcription("@cf/openai/whisper-large-v3-turbo"),
	audio: audioData,
	mediaType: "audio/wav",
});

// Speech
const speech = await experimental_generateSpeech({
	model: workersai.speech("@cf/deepgram/aura-1"),
	text: "Hello world",
	voice: "asteria",
});

// Reranking
const ranked = await rerank({
	model: workersai.reranking("@cf/baai/bge-reranker-base"),
	query: "What is machine learning?",
	documents: ["ML is a branch of AI.", "The weather is sunny."],
});
```
