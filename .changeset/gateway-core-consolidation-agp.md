---
"ai-gateway-provider": minor
---

New gateway options, plus the provider routing table and `cf-aig-*` header
building are now shared with the `workers-ai-provider` AI Gateway delegate
(bundled inline — no new dependency), so the two stay in lockstep.

- `AiGatewayOptions` gains two universal-endpoint controls: `byokAlias`
  (`cf-aig-byok-alias`, select a stored BYOK key by alias) and `zdr`
  (`cf-aig-zdr`, per-request Zero Data Retention override for Unified Billing).
- Cache controls now emit the current `cf-aig-cache-ttl` / `cf-aig-skip-cache`
  header names instead of the upstream-deprecated `cf-cache-ttl` / `cf-skip-cache`.
- New opt-in **resumable streaming** on the binding/run path (**coming soon** —
  not generally available yet while the AI Gateway resume backend rolls out;
  treat as experimental): pass `resume`
  (`{ binding: env.AI, gateway, onResumeExpired?, maxReconnects? }`) and a
  streaming run that surfaces a `cf-aig-run-id` will transparently reconnect on a
  transient mid-stream drop, reusing the same resumable-stream engine as the
  `workers-ai-provider` delegate. No-op on the REST/API-key path and on
  non-streaming calls.
- The misspelled `retries` option type is renamed `AiGatewayReties` →
  `AiGatewayRetries`; the old name stays exported as a deprecated alias, so this
  is non-breaking.

Existing behavior is otherwise unchanged.
