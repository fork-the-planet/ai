---
"@cloudflare/tanstack-ai": minor
---

- Add **resumable streaming** to the Workers AI adapter (**coming soon** — not
  generally available yet while the AI Gateway resume backend rolls out; treat as
  experimental): catalog models dispatch through the AI Gateway run path, so
  transient mid-stream drops reconnect transparently via `cf-aig-run-id`.
  Configure with `resume` / `onResumeExpired` (no-op + warning where no run id is
  available, e.g. REST).
- Gain the gpt-oss **forced tool-call salvage** (#560) and non-SSE
  graceful-degradation, now shared with `workers-ai-provider`.
- Bump `@tanstack/ai` and the `@tanstack/ai-*` adapter peers to current versions
  (adapts to the multimodal `MediaPrompt` API). `@ai-sdk/*` is intentionally not
  bumped.
