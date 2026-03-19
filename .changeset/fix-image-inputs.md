---
"workers-ai-provider": patch
"@cloudflare/tanstack-ai": patch
---

Fix image inputs for vision-capable chat models

- Handle all `LanguageModelV3DataContent` variants (Uint8Array, base64 string, data URL) instead of only Uint8Array
- Send images as OpenAI-compatible `image_url` content parts inline in messages, enabling vision for models like Llama 4 Scout and Kimi K2.5
- Works with both the binding and REST API paths
