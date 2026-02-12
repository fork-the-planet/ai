---
"@cloudflare/tanstack-ai": patch
---

- Update model recommendations: Aura-2 EN for TTS, Llama 4 Scout for chat examples
- Add Aura-2 EN/ES to TTS model type
- Preserve image/vision content in user messages instead of stripping to text-only
- Add non-streaming fallback when REST streaming fails (GPT-OSS, Kimi)
- Warn on premature stream termination instead of silently reporting "stop"
- Consistent console.warn prefix for SSE parse errors
- Move @cloudflare/workers-types from optionalDependencies to devDependencies (types-only, no runtime use)
- Fix @openrouter/sdk version mismatch type errors
