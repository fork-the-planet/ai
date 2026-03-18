---
"@cloudflare/tanstack-ai": patch
---

Add `sessionAffinity` option to `WorkersAiAdapterConfig` for prefix-cache optimization. Routes requests with the same key to the same backend replica via the `x-session-affinity` header. Supported across binding, REST, and gateway modes.
