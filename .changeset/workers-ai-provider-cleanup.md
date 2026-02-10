---
"workers-ai-provider": patch
---

Comprehensive cleanup of the workers-ai-provider package.

**Bug fixes:**

- Fixed phantom dependency on `fetch-event-stream` that caused runtime crashes when installed outside the monorepo. Replaced with a built-in SSE parser.
- Fixed streaming buffering: responses now stream token-by-token instead of arriving all at once. The root cause was twofold — an eager `ReadableStream` `start()` pattern that buffered all chunks, and a heuristic that silently fell back to non-streaming `doGenerate` whenever tools were defined. Both are fixed. Streaming now uses a proper `TransformStream` pipeline with backpressure.
- Fixed `reasoning-delta` ID mismatch in simulated streaming — was using `generateId()` instead of the `reasoningId` from the preceding `reasoning-start` event, causing the AI SDK to drop reasoning content.
- Fixed REST API client (`createRun`) silently swallowing HTTP errors. Non-200 responses now throw with status code and response body.
- Fixed `response_format` being sent as `undefined` on every non-JSON request. Now only included when actually set.
- Fixed `json_schema` field evaluating to `false` (a boolean) instead of `undefined` when schema was missing.

**Workers AI quirk workarounds:**

- Added `sanitizeToolCallId()` — strips non-alphanumeric characters and pads/truncates to 9 chars, fixing tool call round-trips through the binding which rejects its own generated IDs.
- Added `normalizeMessagesForBinding()` — converts `content: null` to `""` and sanitizes tool call IDs before every binding call. Only applied on the binding path (REST preserves original IDs).
- Added null-finalization chunk filtering for streaming tool calls.
- Added numeric value coercion in native-format streams (Workers AI sometimes returns numbers instead of strings for the `response` field).
- Improved image model to handle all output types from `binding.run()`: `ReadableStream`, `Uint8Array`, `ArrayBuffer`, `Response`, and `{ image: base64 }` objects.
- Graceful degradation: if `binding.run()` returns a non-streaming response despite `stream: true`, it wraps the complete response as a simulated stream instead of throwing.

**Premature stream termination detection:**

- Streams that end without a `[DONE]` sentinel now report `finishReason: "error"` with `raw: "stream-truncated"` instead of silently reporting `"stop"`.
- Stream read errors are caught and emit `finishReason: "error"` with `raw: "stream-error"`.

**AI Search (formerly AutoRAG):**

- Added `createAISearch` and `AISearchChatLanguageModel` as the canonical exports, reflecting the rename from AutoRAG to AI Search.
- `createAutoRAG` still works but emits a one-time deprecation warning pointing to `createAISearch`.
- `createAutoRAG` preserves `"autorag.chat"` as the provider name for backward compatibility.
- AI Search now warns when tools or JSON response format are provided (unsupported by the `aiSearch` API).
- Simplified AI Search internals — removed dead tool/response-format processing code.

**Code quality:**

- Removed dead code: `workersai-error.ts` (never imported), `workersai-image-config.ts` (inlined).
- Consistent file naming: renamed `workers-ai-embedding-model.ts` to `workersai-embedding-model.ts`.
- Replaced `StringLike` catch-all index signatures with `[key: string]: unknown` on settings types.
- Replaced `any` types with proper interfaces (`FlatToolCall`, `OpenAIToolCall`, `PartialToolCall`).
- Tightened `processToolCall` format detection to check `function.name` instead of just the presence of a `function` property.
- Removed `@ai-sdk/provider-utils` and `zod` peer dependencies (no longer used in source).
- Added `imageModel` to the `WorkersAI` interface type for consistency.

**Tests:**

- 149 unit tests across 10 test files (up from 82).
- New test coverage: `sanitizeToolCallId`, `normalizeMessagesForBinding`, `prepareToolsAndToolChoice`, `processText`, `mapWorkersAIUsage`, image model output types, streaming error scenarios (malformed SSE, premature termination, empty stream), backpressure verification, graceful degradation (non-streaming fallback with text/tools/reasoning), REST API error handling (401/404/500), AI Search warnings, embedding `TooManyEmbeddingValuesForCallError`, message conversion with images and reasoning.
- Integration tests for REST API and binding across 12 models and 7 categories (chat, streaming, multi-turn, tool calling, tool round-trip, structured output, image generation, embeddings).
- All tests use the AI SDK's public APIs (`generateText`, `streamText`, `generateImage`, `embedMany`) instead of internal `.doGenerate()`/`.doStream()` methods.

**README:**

- Rewritten from scratch with concise examples, model recommendations, configuration guide, and known limitations section.
- Updated to use current AI SDK v6 APIs (`generateText` + `Output.object` instead of deprecated `generateObject`, `generateImage` instead of `experimental_generateImage`, `stopWhen: stepCountIs(2)` instead of `maxSteps`).
- Added sections for tool calling, structured output, embeddings, image generation, and AI Search.
- Uses `wrangler.jsonc` format for configuration examples.
