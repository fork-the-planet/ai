---
"workers-ai-provider": patch
---

- Rewrite README with updated model recommendations (GPT-OSS 120B, EmbeddingGemma 300M, Aura-2 EN)
- Stream tool calls incrementally using tool-input-start/delta/end events instead of buffering until stream end
- Fix REST streaming for models that don't support it on /ai/run/ (GPT-OSS, Kimi) by retrying without streaming
- Add Aura-2 EN/ES to SpeechModels type
- Log malformed SSE events with console.warn instead of silently swallowing
