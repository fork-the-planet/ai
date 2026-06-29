---
"workers-ai-provider": minor
---

Native Workers AI failures are now surfaced as AI SDK `APICallError`s so the AI
SDK's built-in retry (`maxRetries`) can engage on transient errors.

Previously the binding path (`env.AI.run`) threw plain `Error`s and the REST
path threw a generic `Error`, so the AI SDK never retried them — most notably
the common **"out of capacity"** failure (internal code `3040`, HTTP `429`) and
other 5xx blips just failed the call outright.

- **Binding path**: errors thrown by `env.AI.run` are normalized into an
  `APICallError` across every Workers AI model — chat, embedding, image, speech,
  transcription, and reranking. The Workers AI internal error code is parsed from
  the message (or a numeric `code` property) and mapped to the documented HTTP
  status (e.g. `3040`/`3036` → `429`, `3007`/`3008` → `408`, `5007` → `400`), and
  `APICallError` derives `isRetryable` from that status (retryable on
  408/409/429/5xx). Unrecognized errors get no status and stay non-retryable
  (prior behavior). `AbortError`/`TimeoutError` cancellations propagate
  unchanged.
- **REST path**: non-OK responses now throw an `APICallError` carrying the real
  `statusCode`, response headers (so `Retry-After` is honored), and body, instead
  of a generic `Error`. The error message keeps the same
  `Workers AI API error (<status> <statusText>): <body>` shape.

This means transient capacity/5xx errors are now automatically retried with
exponential backoff by `generateText`/`streamText` (default 2 retries; tune via
`maxRetries`). Set `maxRetries: 0` to opt out.
