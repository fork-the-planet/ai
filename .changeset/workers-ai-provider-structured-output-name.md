---
"workers-ai-provider": patch
---

Keep structured-output `name`/`description` instead of dropping them on native Workers AI models.

`Output.object({ schema, name, description })` and `generateObject({ schema,
schemaName, schemaDescription })` pass a `name`/`description` alongside the JSON
schema. On the native `@cf/...` path the provider previously forwarded only the
bare schema as `response_format.json_schema` and silently discarded both.

Native Workers AI expects `json_schema` to be a **bare** JSON Schema, not
OpenAI's `{ name, schema, strict }` envelope, so we can't just wrap it (that
would break native models). Instead the `name` is folded into the schema's
standard `title` keyword and the `description` into its `description` keyword —
the payload stays a valid bare schema while the guidance reaches the model.
Existing schema-level `title`/`description` are never overwritten and the input
schema is not mutated.

Note on issue #559: the reported failure was OpenAI partner models (e.g.
`openai/gpt-5.4-mini`) rejecting requests with `Missing required parameter:
'response_format.json_schema.name'`. Partner-model slugs are no longer handled
by this code path at all — they route through the AI Gateway delegate and the
real `@ai-sdk/*` providers, which build the required `json_schema.name` envelope
themselves (configure them via `createWorkersAI({ binding, providers: [openai]
})`). This change covers the remaining native-model gap where that guidance was
being dropped.

See https://github.com/cloudflare/ai/issues/559.
