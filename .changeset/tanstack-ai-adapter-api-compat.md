---
"@cloudflare/tanstack-ai": patch
---

Update for the latest `@tanstack/ai` adapter API and refresh Workers AI model references.

- Use the new provider summarize factory functions (`createAnthropicSummarize`, `createGeminiSummarize`, `createGrokSummarize`, `createOpenaiSummarize`, `createOpenRouterSummarize`) instead of the removed `*SummarizeAdapter` classes, and give the gateway `create*Summarize` wrappers explicit `AnySummarizeAdapter` return types so declaration files generate cleanly.
- Migrate the Workers AI streaming adapter to the `EventType` enum and the updated `TextOptions` shape (sampling knobs such as `temperature`/`max_tokens` now flow through `modelOptions`; `systemPrompts` accepts `SystemPrompt` objects).
- Align the image, transcription, and TTS adapters with the new `(model, config?)` base-adapter constructor signature.
- Update default/example Workers AI model references to current models (`@cf/google/gemma-4-26b-a4b-it`, `@cf/moonshotai/kimi-k2.7-code`), replacing deprecated ones.
