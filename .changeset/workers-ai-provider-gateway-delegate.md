---
"workers-ai-provider": minor
---

Add a gateway delegate for routing AI SDK catalog models through Cloudflare AI Gateway with capability-driven transport selection.

New sub-path exports:

- `workers-ai-provider/gateway-delegate` — `createGatewayDelegate({ binding, gateway, providers })` builds AI SDK models from `"<provider>/<model>"` slugs. It picks the transport from the requested options: the **run path** (`env.AI.run`) for resumable streaming (`cf-aig-run-id`, the default), or the **gateway path** (`env.AI.gateway(id).run([…])`) for server-side fallback and caching. Incompatible option combinations (e.g. `resume: true` with `fallback.mode: "server"`) throw a clear `GatewayDelegateError`; resume-disabling combinations warn loudly.
- `workers-ai-provider/openai` and `workers-ai-provider/anthropic` — provider plugins that adapt the corresponding AI SDK provider. `@ai-sdk/openai` and `@ai-sdk/anthropic` are now **optional** peer dependencies; install only the ones you use.

On the run path, the response stream is wrapped so a transient mid-stream drop reconnects through the gateway resume endpoint (`resume?from=N`) transparently — the `@ai-sdk` parser never sees the break. `from` is an SSE event index, so the wrapper emits only complete events and realigns on the boundary after a drop (no duplicated or truncated bytes). When the gateway buffer expires (404, ~5.5 min TTL), an `onResumeExpired` policy controls whether the stream errors (`"error"`, the default) or ends with partial output (`"accept-partial"`).

For cross-invocation recovery (e.g. a new Durable Object invocation after eviction), `createResumableStream` is exported and accepts no `initial` body plus a `fromEvent` offset — it re-attaches by resuming directly from that event index. An `onProgress(eventOffset)` callback (also surfaced on the delegate as a call option) reports the live SSE event offset so callers can persist `{ runId, eventOffset }` and re-attach later.

The same `@ai-sdk/*` provider parses responses on both transports, so there is no per-provider or per-path response handling.
