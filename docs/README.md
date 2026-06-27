# Cloudflare AI — documentation

Guides and reference for the Cloudflare AI packages: providers and adapters for
the [Vercel AI SDK](https://sdk.vercel.ai/) and [TanStack AI](https://tanstack.com/ai),
backed by [Workers AI](https://ai.cloudflare.com/) and
[AI Gateway](https://developers.cloudflare.com/ai-gateway/).

## How the packages relate

```mermaid
flowchart TD
  app["Your Worker / app"]
  wai["workers-ai-provider<br/>(Vercel AI SDK)"]
  tan["@cloudflare/tanstack-ai<br/>(TanStack AI)"]
  agp["ai-gateway-provider<br/>(Vercel AI SDK)"]
  gw["AI Gateway / Workers AI<br/>(env.AI binding · REST)"]

  app --> wai
  app --> tan
  app --> agp
  wai --> gw
  tan --> gw
  agp --> gw
```

All three packages share the same gateway routing, `cf-aig-*` header building,
resumable-stream engine, and Workers AI SSE handling, so routing, header, and
resume behavior is identical across them. That shared logic is bundled into each
package — there is no extra runtime dependency for you to install.

## Pick a package

| You are using…                                   | Use                                                      | Docs                                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Vercel AI SDK (`ai`)                             | [`workers-ai-provider`](./workers-ai-provider/README.md) | Workers AI models + the AI Gateway **delegate** (unified catalog, resume _(coming soon)_, server-side fallback) |
| TanStack AI (`@tanstack/ai`)                     | [`@cloudflare/tanstack-ai`](./tanstack-ai/README.md)     | Workers AI + gateway adapters, with resumable streaming _(coming soon)_                                         |
| Gateway routing for pre-built `@ai-sdk/*` models | [`ai-gateway-provider`](./ai-gateway-provider/README.md) | Wrap Vercel AI SDK model instances and route them through AI Gateway (caching, retries, cross-vendor fallback)  |

## Concepts

- [Gateway routing](./concepts/gateway-routing.md) — how a `vendor/model` slug
  is routed to the run path or the gateway path, unified vs BYOK billing, and
  server-side fallback.
- [Resumable streaming](./concepts/resume.md) _(coming soon)_ — how transient
  mid-stream drops reconnect transparently via `cf-aig-run-id`, and where resume
  is (and isn't) available.
- [Binding vs REST](./concepts/binding-vs-rest.md) — the `env.AI` binding versus
  the REST API, and what each transport supports.
