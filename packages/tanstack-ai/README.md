# @cloudflare/tanstack-ai

Use [TanStack AI](https://tanstack.com/ai) with Cloudflare Workers AI and AI Gateway. Supports chat with Workers AI, plus chat routing through AI Gateway for OpenAI, Anthropic, Gemini, and Grok.

## Features

- **Workers AI**: Chat via `env.AI` binding or REST API
- **AI Gateway**: Route requests to OpenAI, Anthropic, Gemini, Grok, and Workers AI through Cloudflare's AI Gateway
- **Flexible Configuration**: Use bindings (recommended in Workers) or credentials (REST)
- **Type-Safe**: Full TypeScript support with type inference

## Installation

```bash
npm install @cloudflare/tanstack-ai @tanstack/ai
```

For AI Gateway with third-party providers, install the provider SDKs you need:

```bash
# For OpenAI
npm install @tanstack/ai-openai

# For Anthropic
npm install @tanstack/ai-anthropic

# For Gemini
npm install @tanstack/ai-gemini

# For Grok
npm install @tanstack/ai-grok
```

## Workers AI

The simplest way to use AI in a Cloudflare Worker. No API keys needed for Workers AI models when using a binding.

### Chat

**Using the binding (recommended):**

```typescript
import { createWorkersAiChat } from "@cloudflare/tanstack-ai";
import { chat, toHttpResponse } from "@tanstack/ai";

const adapter = createWorkersAiChat("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
  binding: env.AI,
});

const response = chat({
  adapter,
  stream: true,
  messages: [{ role: "user", content: "Hello!" }],
});

return toHttpResponse(response);
```

**Using REST credentials:**

```typescript
const adapter = createWorkersAiChat("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
  accountId: "your-account-id",
  apiKey: "your-api-key",
});
```

> **Coming soon:** Workers AI embeddings and image generation will be added once TanStack AI standardizes base adapter interfaces for these capabilities.

## AI Gateway

Route AI requests through Cloudflare's AI Gateway for caching, rate limiting, and unified billing. Supports Workers AI and third-party providers.

### Configuration

**Using AI Binding (Recommended for Cloudflare Workers):**

```typescript
const adapter = createOpenAiChat("gpt-4o", {
  binding: env.AI.gateway("my-gateway-id"),
});
```

**Using Credentials:**

```typescript
const adapter = createOpenAiChat("gpt-4o", {
  accountId: "your-account-id",
  gatewayId: "your-gateway-id",
  cfApiKey: "your-cf-api-key", // Optional: if gateway is authenticated
  apiKey: "provider-api-key", // Optional: provider API key if not using Unified Billing or BYOK
});
```

**Cache options (binding and credentials):**

```typescript
const adapter = createOpenAiChat("gpt-4o", {
  binding: env.AI.gateway("my-gateway-id"),
  skipCache: false,
  cacheTtl: 3600,
  customCacheKey: "my-key",
  metadata: { user: "test" },
});
```

### Workers AI through Gateway

```typescript
const adapter = createWorkersAiChat("@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
  binding: env.AI.gateway("my-gateway-id"),
  apiKey: env.WORKERS_AI_TOKEN,
});
```

### Third-Party Providers through Gateway

```typescript
import {
  createOpenAiChat,
  createAnthropicChat,
  createGeminiChat,
  createGrokChat,
} from "@cloudflare/tanstack-ai";

// OpenAI
const openai = createOpenAiChat("gpt-4o", config);

// Anthropic
const anthropic = createAnthropicChat("claude-sonnet-4-5", config);

// Gemini (credentials only)
const gemini = createGeminiChat("gemini-2.0-flash", {
  accountId: env.CF_ACCOUNT_ID,
  gatewayId: env.CF_AIG_ID,
  cfApiKey: env.CF_AIG_TOKEN,
});

// Grok
const grok = createGrokChat("grok-4", config);
```

## Supported Capabilities

| Provider       | Chat | Summarize | Embeddings | Image Gen | Transcription | TTS | Video |
| -------------- | ---- | --------- | ---------- | --------- | ------------- | --- | ----- |
| **Workers AI** | ✅   | ❌        | 🔜         | 🔜        | ❌            | ❌  | ❌    |
| **OpenAI**     | ✅   | ✅        | ❌         | ✅        | ✅            | ✅  | ✅    |
| **Gemini**     | ✅   | ✅        | ❌         | ✅        | ❌            | ❌  | ❌    |
| **Anthropic**  | ✅   | ✅        | ❌         | ❌        | ❌            | ❌  | ❌    |
| **Grok**       | ✅   | ❌        | ❌         | ✅        | ❌            | ❌  | ❌    |

### All Functions

**Workers AI:**

- `createWorkersAiChat(model, config)` -- chat and structured output

**OpenAI:**

- `createOpenAiChat(model, config)`
- `createOpenAiSummarize(model, config)`
- `createOpenAiImage(model, config)`
- `createOpenAiTranscription(model, config)`
- `createOpenAiTts(model, config)`
- `createOpenAiVideo(model, config)`

**Anthropic:**

- `createAnthropicChat(model, config)`
- `createAnthropicSummarize(model, config)`

**Gemini:**

- `createGeminiChat(model, config)` -- credentials only, no binding support
- `createGeminiSummarize(model, config)` -- credentials only, no binding support
- `createGeminiImage(model, config)` -- credentials only, no binding support

> **Note:** Gemini adapters use the Google GenAI SDK's `httpOptions.baseUrl` to route through the gateway, rather than the custom fetch approach used by other providers. This means gateway caching options (`skipCache`, `cacheTtl`, `customCacheKey`, `metadata`) are not supported for Gemini adapters.

**Grok:**

- `createGrokChat(model, config)`
- `createGrokImage(model, config)`

## Workers AI Configuration Modes

Workers AI supports four configuration modes:

| Mode              | Config                               | Description                          |
| ----------------- | ------------------------------------ | ------------------------------------ |
| Plain binding     | `{ binding: env.AI }`               | Direct access, no gateway            |
| Plain REST        | `{ accountId, apiKey }`             | REST API, no gateway                 |
| Gateway binding   | `{ binding: env.AI.gateway(id) }`   | Through AI Gateway via binding       |
| Gateway REST      | `{ accountId, gatewayId, ... }`     | Through AI Gateway via REST          |

Third-party providers (OpenAI, Anthropic, Gemini, Grok) only support the gateway modes.

## Links

- [TanStack AI Documentation](https://tanstack.com/ai)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/)
