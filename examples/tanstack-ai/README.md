# @cloudflare/tanstack-ai demo

Multi-provider AI demo showcasing [`@cloudflare/tanstack-ai`](../../packages/tanstack-ai). Features **Chat**, **Image Generation**, and **Summarization** across Workers AI and third-party providers (OpenAI, Anthropic, Gemini, Grok) through Cloudflare AI Gateway.

## Features

### Chat

| Provider              | Model                                     | Config Mode               |
| --------------------- | ----------------------------------------- | ------------------------- |
| **Llama 4 Scout**     | `@cf/meta/llama-4-scout-17b-16e-instruct` | Workers AI direct         |
| **Qwen3 30B**         | `@cf/qwen/qwen3-30b-a3b-fp8`              | Workers AI via AI Gateway |
| **GPT-5.2**           | `gpt-5.2`                                 | OpenAI via AI Gateway     |
| **Claude Sonnet 4.5** | `claude-sonnet-4-5`                       | Anthropic via AI Gateway  |
| **Gemini 2.5 Flash**  | `gemini-2.5-flash`                        | Gemini via AI Gateway     |
| **Grok 4**            | `grok-4-1-fast-reasoning`                 | Grok via AI Gateway       |

### Image Generation

| Provider   | Model                     |
| ---------- | ------------------------- |
| **OpenAI** | `gpt-image-1`             |
| **Gemini** | `imagen-4.0-generate-001` |
| **Grok**   | `grok-2-image-1212`       |

### Summarization

| Provider      | Model               |
| ------------- | ------------------- |
| **OpenAI**    | `gpt-5.2`           |
| **Anthropic** | `claude-sonnet-4-5` |
| **Gemini**    | `gemini-2.0-flash`  |

## Setup

### Option 1: Enter credentials in the UI (recommended for trying it out)

1. Install and run:

```bash
pnpm install
pnpm dev
```

2. Click **"Add API keys"** in the top-right corner and enter your Cloudflare Account ID, AI Gateway ID, and API Token. Credentials are stored in your browser's localStorage and sent as request headers -- never persisted on the server.

### Option 2: Use environment variables (recommended for deploying)

1. Copy the environment variables template:

```bash
cp .dev.vars.example .dev.vars
```

2. Fill in your `.dev.vars`:

```
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
CLOUDFLARE_AI_GATEWAY_ID=your-ai-gateway-id
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
```

3. Install and run:

```bash
pnpm install
pnpm dev
```

> When both are present, user-provided credentials (from the UI) take precedence over environment variables.

## What It Demonstrates

- **Workers AI direct** -- `createWorkersAiChat(model, { binding: env.AI })` or REST API with `{ accountId, apiKey }`
- **Workers AI through AI Gateway** -- `createWorkersAiChat(model, { binding: env.AI.gateway(id) })` or credentials mode
- **Third-party providers through AI Gateway** -- `createOpenAiChat`, `createAnthropicChat`, `createGeminiChat`, `createGrokChat`
- **Image generation** -- `generateImage()` with `createOpenAiImage`, `createGeminiImage`, `createGrokImage`
- **Summarization** -- `summarize()` with `createOpenAiSummarize`, `createAnthropicSummarize`, `createGeminiSummarize`
- **Streaming** -- chat providers stream responses via TanStack AI's `chat()` + `toHttpResponse()`
- **Tool calling** -- server-side tools (math, time, web scrape) work across all chat providers
- **Dynamic credentials** -- user-provided API keys passed via request headers, with env var fallback
