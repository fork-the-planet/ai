import type { LanguageModelV3 } from "@ai-sdk/provider";
import { createResumableStream, type ResumeExpiredPolicy } from "./resumable-stream";

export {
	createResumableStream,
	type ResumableStreamOptions,
	type ResumeExpiredPolicy,
} from "./resumable-stream";

/**
 * Gateway delegate — route AI SDK catalog models through Cloudflare AI Gateway,
 * with capability-driven transport selection.
 *
 * Two transports back the same model, chosen from the requested options:
 *
 *   - **Run path** `env.AI.run(slug, body, { returnRawResponse })` — resumable
 *     streaming (`cf-aig-run-id`). The default.
 *   - **Gateway path** `env.AI.gateway(id).run([entry, …fallback])` — server-side
 *     fallback and caching. Does not surface `cf-aig-run-id`, so resume is off.
 *
 * The SAME `@ai-sdk/*` provider parses the response on either path, so there is no
 * per-provider or per-path response parsing here. Provider plugins (which import
 * `@ai-sdk/openai`, `@ai-sdk/anthropic`, …) are injected from sub-path modules
 * (`workers-ai-provider/openai`, …) so those AI SDK packages stay OPTIONAL peer
 * dependencies — you only install the ones you use.
 *
 * @example
 * ```ts
 * import { createGatewayDelegate } from "workers-ai-provider/gateway-delegate";
 * import { openai } from "workers-ai-provider/openai";
 * import { streamText } from "ai";
 *
 * const wai = createGatewayDelegate({
 *   binding: env.AI,
 *   gateway: "my-gateway",
 *   providers: [openai],
 * });
 *
 * const result = streamText({ model: wai("openai/gpt-5"), prompt: "Hello" });
 * // result.response.headers["cf-aig-run-id"] is set — resume from there.
 * ```
 */

// ---------------------------------------------------------------------------
// Slug parsing
// ---------------------------------------------------------------------------

export interface ParsedSlug {
	/** First path segment — selects the provider plugin and gateway provider id. */
	resolverKey: string;
	/** Provider id sent to the gateway universal endpoint. */
	providerId: string;
	/** Remaining segments — the provider-native model id. */
	modelId: string;
}

/**
 * Parse a `vendor/model` slug. The first segment is the resolver key (which
 * provider plugin handles it); the rest is the provider-native model id. Routing
 * providers keep multi-segment model ids, e.g. `openrouter/anthropic/claude`.
 */
export function parseSlug(slug: string): ParsedSlug {
	const slash = slug.indexOf("/");
	if (slash === -1) {
		throw new GatewayDelegateError(
			"config",
			`Model slug "${slug}" has no resolver key. Use "<provider>/<model>" (e.g. "openai/gpt-5").`,
		);
	}
	const resolverKey = slug.slice(0, slash);
	const modelId = slug.slice(slash + 1);
	if (!resolverKey || !modelId) {
		throw new GatewayDelegateError(
			"config",
			`Model slug "${slug}" is malformed. Use "<provider>/<model>" (e.g. "openai/gpt-5").`,
		);
	}
	return { resolverKey, providerId: resolverKey, modelId };
}

// ---------------------------------------------------------------------------
// Provider plugins (injected from sub-path modules)
// ---------------------------------------------------------------------------

/**
 * Adapts a `@ai-sdk/*` provider to the delegate. Imported from a sub-path module
 * (e.g. `workers-ai-provider/openai`) so the AI SDK package stays an optional peer
 * dependency.
 */
export interface ProviderPlugin {
	/** Matches the first segment of a model slug (e.g. `"openai"`). */
	readonly resolverKey: string;
	/** Build the AI SDK model, wiring the gateway-dispatching `fetch`. */
	create(args: { modelId: string; fetch: typeof globalThis.fetch }): LanguageModelV3;
}

// ---------------------------------------------------------------------------
// Options + transport selection
// ---------------------------------------------------------------------------

export type Transport = "run" | "gateway";

export interface FallbackOptions {
	/** `"client"` keeps resume (sequential run-path attempts); `"server"` uses the gateway path. */
	mode: "client" | "server";
	/** Ordered model slugs to try after the primary. */
	models: string[];
}

export interface DispatchInfo {
	transport: Transport;
	resumeEnabled: boolean;
	warnings: string[];
	runId: string | null;
	status: number | null;
	cfStep: string | null;
	cacheStatus: string | null;
	logId: string | null;
}

export interface DelegateCallOptions {
	/** Resumable streaming (run path). Defaults to the delegate's `resume` (true). */
	resume?: boolean;
	/** Cross-model fallback. `"server"` mode uses the gateway path (disables resume). */
	fallback?: FallbackOptions;
	/** Gateway-path response caching (seconds). Forces the gateway path. */
	cacheTtl?: number;
	/** Bypass gateway cache. Forces the gateway path. */
	skipCache?: boolean;
	/** Escape hatch: force a transport. */
	transport?: Transport;
	/**
	 * Run path only: behavior when the resume buffer has expired (404) after a
	 * mid-stream drop. `"error"` (default) surfaces a `GatewayDelegateError`;
	 * `"accept-partial"` ends the stream cleanly with whatever was delivered.
	 */
	onResumeExpired?: ResumeExpiredPolicy;
	/** Extra request headers (run path: `extraHeaders`; gateway path: entry headers). */
	extraHeaders?: Record<string, string>;
	/** Override the delegate's gateway for this model. */
	gateway?: GatewayOptions | string;
	/** Called once per dispatch with the resolved transport + gateway headers. */
	onDispatch?: (info: DispatchInfo) => void;
}

interface Selection {
	transport: Transport;
	resumeEnabled: boolean;
	warnings: string[];
}

/**
 * Resolve the transport from the requested options. Gateway-only features (server
 * fallback, caching) force the gateway path and disable resume — with a loud
 * warning if resume was merely defaulted, or a thrown error if it was explicitly
 * requested.
 */
export function selectTransport(
	opts: DelegateCallOptions,
	resumeExplicitlyTrue: boolean,
): Selection {
	const warnings: string[] = [];
	const wantsServerFallback = opts.fallback?.mode === "server";
	const wantsCaching = opts.cacheTtl !== undefined || opts.skipCache === true;
	const gatewayOnly = wantsServerFallback || wantsCaching;
	const feature = wantsServerFallback ? 'fallback.mode:"server"' : "caching (cacheTtl/skipCache)";

	if (opts.transport === "run" && gatewayOnly) {
		throw new GatewayDelegateError(
			"config",
			`transport:"run" cannot satisfy ${feature}: those features are only available on the ` +
				'gateway path. Use the gateway transport, or fallback.mode:"client".',
		);
	}
	if (opts.transport === "gateway" && resumeExplicitlyTrue) {
		throw new GatewayDelegateError(
			"config",
			'transport:"gateway" cannot provide resume — cf-aig-run-id is only on the run path.',
		);
	}

	if (gatewayOnly) {
		if (resumeExplicitlyTrue) {
			throw new GatewayDelegateError(
				"config",
				`resume:true conflicts with ${feature}: resume (cf-aig-run-id) is only on the run path, ` +
					`which does not support ${wantsServerFallback ? "server-side fallback" : "caching"}. ` +
					'Use fallback.mode:"client" to keep resume, or drop resume.',
			);
		}
		warnings.push(
			`[workers-ai-provider] resume disabled: ${feature} requires the gateway path, which does ` +
				'not surface cf-aig-run-id. Use fallback.mode:"client" to keep resumable streaming.',
		);
		return { transport: "gateway", resumeEnabled: false, warnings };
	}

	const transport = opts.transport ?? "run";
	return {
		transport,
		resumeEnabled: transport === "run" && opts.resume !== false,
		warnings,
	};
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type GatewayDelegateErrorKind = "config" | "dispatch" | "provider" | "resume-expired";

export class GatewayDelegateError extends Error {
	readonly kind: GatewayDelegateErrorKind;
	override readonly cause?: unknown;

	constructor(kind: GatewayDelegateErrorKind, message: string, cause?: unknown) {
		super(message);
		this.name = "GatewayDelegateError";
		this.kind = kind;
		this.cause = cause;
	}
}

// ---------------------------------------------------------------------------
// Dispatch internals
// ---------------------------------------------------------------------------

// Stripped on the gateway path — unified billing / BYOK is the gateway's job, and
// forwarding the AI SDK's placeholder key would 401 upstream.
const STRIP_HEADERS = new Set(["authorization", "x-api-key", "content-length", "host"]);

interface GatewayEntry {
	provider: string;
	endpoint: string;
	headers: Record<string, string>;
	query: Record<string, unknown>;
}

interface AiGatewayRunner {
	run(body: unknown, options?: Record<string, unknown>): Promise<Response>;
}

function asText(body: BodyInit | null | undefined): string {
	if (typeof body === "string") return body;
	if (body instanceof Uint8Array) return new TextDecoder().decode(body);
	if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
	return "{}";
}

function headersToObject(h: HeadersInit | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	if (!h) return out;
	if (h instanceof Headers) {
		for (const [k, v] of h) out[k] = v;
	} else if (Array.isArray(h)) {
		for (const [k, v] of h) out[k] = v;
	} else {
		Object.assign(out, h);
	}
	return out;
}

function normalizeGateway(gateway: GatewayOptions | string | undefined): {
	id: string;
	options: GatewayOptions;
} {
	if (!gateway) {
		throw new GatewayDelegateError(
			"config",
			"A gateway is required for the delegate (resume needs a gateway). " +
				'Pass `gateway: "<gateway-id>"` to createGatewayDelegate or per call.',
		);
	}
	if (typeof gateway === "string") return { id: gateway, options: { id: gateway } };
	return { id: gateway.id, options: gateway };
}

export interface GatewayDelegateConfig {
	/** A Cloudflare AI binding (e.g. `env.AI`). Required — the gateway path needs `binding.gateway()`. */
	binding: Ai;
	/** Default gateway id (or options) for all models. Overridable per call. */
	gateway?: GatewayOptions | string;
	/** Provider plugins from sub-path modules (e.g. `[openai, anthropic]`). */
	providers: ProviderPlugin[];
	/** Default resume behavior when a call does not specify one. Defaults to `true`. */
	resume?: boolean;
	/** Default resume-expiry policy (run path). Defaults to `"error"`. */
	onResumeExpired?: ResumeExpiredPolicy;
}

export interface GatewayDelegate {
	(slug: string, options?: DelegateCallOptions): LanguageModelV3;
}

/**
 * Create a gateway delegate. Returns a function that builds an AI SDK model for a
 * `"<provider>/<model>"` slug, dispatched through AI Gateway on the transport the
 * requested options imply.
 */
export function createGatewayDelegate(config: GatewayDelegateConfig): GatewayDelegate {
	if (!config?.binding) {
		throw new GatewayDelegateError(
			"config",
			"createGatewayDelegate requires a `binding` (e.g. { binding: env.AI }).",
		);
	}
	if (!config.providers?.length) {
		throw new GatewayDelegateError(
			"config",
			"createGatewayDelegate requires at least one provider plugin, e.g. " +
				'`providers: [openai]` from "workers-ai-provider/openai".',
		);
	}

	const plugins = new Map<string, ProviderPlugin>();
	for (const p of config.providers) plugins.set(p.resolverKey, p);
	const defaultResume = config.resume ?? true;

	return (slug, options = {}) => {
		const parsed = parseSlug(slug);
		const plugin = plugins.get(parsed.resolverKey);
		if (!plugin) {
			throw new GatewayDelegateError(
				"config",
				`No provider plugin for "${parsed.resolverKey}" (from slug "${slug}"). ` +
					`Registered: ${[...plugins.keys()].join(", ") || "<none>"}. ` +
					'Install + pass the matching plugin (e.g. `openai` from "workers-ai-provider/openai").',
			);
		}

		const resumeExplicitlyTrue = options.resume === true;
		const effectiveOptions: DelegateCallOptions = {
			...options,
			resume: options.resume ?? defaultResume,
			onResumeExpired: options.onResumeExpired ?? config.onResumeExpired,
		};
		const selection = selectTransport(effectiveOptions, resumeExplicitlyTrue);
		for (const w of selection.warnings) console.warn(w);

		const { id: gatewayId, options: gatewayOptions } = normalizeGateway(
			options.gateway ?? config.gateway,
		);

		const fetchImpl =
			selection.transport === "run"
				? makeRunFetch(
						config.binding,
						slug,
						gatewayOptions,
						effectiveOptions,
						selection,
						options,
					)
				: makeGatewayFetch(
						config.binding,
						parsed,
						gatewayId,
						effectiveOptions,
						selection,
						options,
					);

		return plugin.create({ modelId: parsed.modelId, fetch: fetchImpl });
	};
}

function fireDispatch(resp: Response, selection: Selection, options: DelegateCallOptions): void {
	if (!options.onDispatch) return;
	options.onDispatch({
		transport: selection.transport,
		resumeEnabled: selection.resumeEnabled,
		warnings: selection.warnings,
		status: resp.status,
		runId: resp.headers.get("cf-aig-run-id"),
		cfStep: resp.headers.get("cf-aig-step"),
		cacheStatus: resp.headers.get("cf-aig-cache-status"),
		logId: resp.headers.get("cf-aig-log-id"),
	});
}

function makeRunFetch(
	binding: Ai,
	slug: string,
	gatewayOptions: GatewayOptions,
	opts: DelegateCallOptions,
	selection: Selection,
	callOptions: DelegateCallOptions,
): typeof globalThis.fetch {
	return (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const body = JSON.parse(asText(init?.body)) as Record<string, unknown>;
		// The slug carries the model; drop the redundant body field (both are tolerated).
		delete body.model;

		const runOptions = {
			gateway: gatewayOptions,
			returnRawResponse: true,
			...(opts.extraHeaders ? { extraHeaders: opts.extraHeaders } : {}),
			...(init?.signal ? { signal: init.signal } : {}),
		};

		// The binding's `run` is heavily overloaded; narrow to the raw-Response
		// streaming signature. Call as a METHOD on the binding — extracting it
		// into a bare variable detaches `this` and the binding throws on a private
		// field access ("Cannot set properties of undefined (setting '#options')").
		const ai = binding as unknown as {
			run(
				model: string,
				inputs: Record<string, unknown>,
				options: Record<string, unknown>,
			): Promise<Response>;
		};
		const resp = await ai.run(slug, body, runOptions);
		fireDispatch(resp, selection, callOptions);

		// Wrap the stream so a transient mid-stream drop reconnects via the gateway
		// resume endpoint transparently — the @ai-sdk parser never sees the break.
		const runId = resp.headers.get("cf-aig-run-id");
		if (selection.resumeEnabled && runId && resp.body) {
			const resumable = createResumableStream({
				binding,
				gateway: gatewayOptions.id,
				runId,
				initial: resp.body,
				onResumeExpired: opts.onResumeExpired,
			});
			return new Response(resumable, { status: resp.status, headers: resp.headers });
		}
		return resp;
	}) as typeof globalThis.fetch;
}

function makeGatewayFetch(
	binding: Ai,
	parsed: ParsedSlug,
	gatewayId: string,
	opts: DelegateCallOptions,
	selection: Selection,
	callOptions: DelegateCallOptions,
): typeof globalThis.fetch {
	return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = new URL(typeof input === "string" ? input : input.toString());
		const endpoint = url.pathname.replace(/^\//, "") + (url.search || "");
		const body = JSON.parse(asText(init?.body)) as Record<string, unknown>;

		const headers: Record<string, string> = {};
		for (const [k, v] of Object.entries(headersToObject(init?.headers))) {
			if (!STRIP_HEADERS.has(k.toLowerCase())) headers[k] = v;
		}
		if (opts.extraHeaders) Object.assign(headers, opts.extraHeaders);
		// Best-effort gateway cache control (gateway-side config may still override).
		if (opts.cacheTtl !== undefined) headers["cf-aig-cache-ttl"] = String(opts.cacheTtl);
		if (opts.skipCache) headers["cf-aig-skip-cache"] = "true";

		const primary: GatewayEntry = {
			provider: parsed.providerId,
			endpoint,
			headers,
			query: body,
		};
		const entries: GatewayEntry[] = [primary];

		if (opts.fallback?.mode === "server") {
			for (const fb of opts.fallback.models) {
				const fbParsed = parseSlug(fb);
				if (fbParsed.providerId !== parsed.providerId) {
					throw new GatewayDelegateError(
						"config",
						`Cross-vendor server-side fallback (${parsed.providerId} → ${fbParsed.providerId}) ` +
							'is not supported yet. Use fallback.mode:"client", or same-vendor fallback models.',
					);
				}
				entries.push({ ...primary, query: { ...body, model: fbParsed.modelId } });
			}
		}

		const gw = (binding as unknown as { gateway(id: string): AiGatewayRunner }).gateway(
			gatewayId,
		);
		const resp = await gw.run(entries);
		fireDispatch(resp, selection, callOptions);
		return resp;
	}) as typeof globalThis.fetch;
}
