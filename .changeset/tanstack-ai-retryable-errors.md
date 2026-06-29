---
"@cloudflare/tanstack-ai": minor
---

Retry transient Workers AI failures and normalize errors across every adapter.

- **Chat**: the binding shim now surfaces binding failures as HTTP responses
  (e.g. "out of capacity" `3040` → `429`, "no such model" `5007` → `400`) so the
  OpenAI SDK's status-based retry engages and honors `Retry-After`. Aborts and
  unrecognized errors propagate untouched. Non-OK gateway run-path responses are
  returned verbatim instead of being swallowed into an empty completion.
- **Non-chat** adapters (embedding, image, TTS, transcription, summarize) gain a
  bounded exponential-backoff retry (the OpenAI SDK isn't in play for these) and
  normalize binding / REST / gateway failures into a single `WorkersAiRequestError`
  carrying the HTTP `status` (and the raw Workers AI `code` when recognized). The
  retry loop honors a server `Retry-After` header. Non-OK gateway responses are no
  longer swallowed.
- Add a `maxRetries` option to the adapter config: forwarded to the OpenAI SDK on
  the chat path, and used by the non-chat retry loop. Defaults to `2`; set to `0`
  to disable.
