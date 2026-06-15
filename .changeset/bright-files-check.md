---
"workers-ai-provider": patch
---

Validate `file` parts in chat messages before sending them to Workers AI.

Previously every `file` part in a user message was unconditionally wrapped as
an `image_url`, regardless of its `mediaType`. Non-image files (e.g.
`application/pdf`, `audio/*`, `video/*`, `application/octet-stream`) were
forwarded as if they were valid vision inputs, and a missing `mediaType`
silently defaulted to `image/png`, producing a corrupt data URL.

Now `convertToWorkersAIChatMessages`:

- throws an `UnsupportedFunctionalityError` when a `file` part has a
  non-`image/*` `mediaType`, or no `mediaType` at all, instead of forwarding
  broken multimodal content;
- matches the `image/` prefix case-insensitively (per RFC 2045), so media
  types such as `IMAGE/JPEG` are accepted while the caller's original casing
  is preserved in the emitted data URL;
- preserves the provided image `mediaType` instead of defaulting missing
  media types to `image/png`.

This is a behavior change: inputs that previously "succeeded" with broken or
defaulted media types now throw a clear, catchable error. Type-correct callers
(the AI SDK always sets `mediaType` on file parts) are unaffected for valid
image inputs.
