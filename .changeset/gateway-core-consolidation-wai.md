---
"workers-ai-provider": minor
---

The AI Gateway delegate gains cross-vendor server-side fallback
(`fallback: { mode: "server" }`) — multiple vendors in one gateway run, with the
winner selected via `cf-aig-step`.

The gateway delegate now reaches header parity with the run path: the gateway
path forwards `cacheKey`, `eventId`, `requestTimeoutMs`, and `retries` from the
gateway options as `cf-aig-*` headers, and `DelegateCallOptions` gains two new
universal-endpoint controls — `byokAlias` (`cf-aig-byok-alias`, select a stored
BYOK key by alias) and `zdr` (`cf-aig-zdr`, per-request Zero Data Retention
override for Unified Billing, applied on both transports).

Internally, the provider registry, `cf-aig-*` header building, resumable-stream
engine, and Workers AI SSE helpers are now shared across the Cloudflare AI
packages (bundled inline — no new dependency for you to install).
