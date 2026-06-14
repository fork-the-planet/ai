import type { LanguageModelV3 } from "@ai-sdk/provider";
import { describe, expect, it, vi } from "vitest";
import {
	createGatewayDelegate,
	GatewayDelegateError,
	parseSlug,
	type ProviderPlugin,
	selectTransport,
} from "../src/gateway-delegate";

// ---------------------------------------------------------------------------
// parseSlug
// ---------------------------------------------------------------------------

describe("parseSlug", () => {
	it("splits vendor/model", () => {
		expect(parseSlug("openai/gpt-5")).toEqual({
			resolverKey: "openai",
			providerId: "openai",
			modelId: "gpt-5",
		});
	});

	it("keeps multi-segment model ids for routing providers", () => {
		expect(parseSlug("openrouter/anthropic/claude-sonnet-4-5")).toEqual({
			resolverKey: "openrouter",
			providerId: "openrouter",
			modelId: "anthropic/claude-sonnet-4-5",
		});
	});

	it("throws when there is no resolver key", () => {
		expect(() => parseSlug("gpt-5")).toThrow(/no resolver key/);
	});

	it("throws when a segment is empty", () => {
		expect(() => parseSlug("openai/")).toThrow(/malformed/);
		expect(() => parseSlug("/gpt-5")).toThrow(/malformed/);
	});
});

// ---------------------------------------------------------------------------
// selectTransport
// ---------------------------------------------------------------------------

describe("selectTransport", () => {
	it("defaults to the run path with resume on", () => {
		const s = selectTransport({}, false);
		expect(s.transport).toBe("run");
		expect(s.resumeEnabled).toBe(true);
		expect(s.warnings).toHaveLength(0);
	});

	it("honors resume:false on the run path", () => {
		const s = selectTransport({ resume: false }, false);
		expect(s.transport).toBe("run");
		expect(s.resumeEnabled).toBe(false);
	});

	it("moves server fallback to the gateway path and warns (resume defaulted)", () => {
		const s = selectTransport(
			{ fallback: { mode: "server", models: ["openai/gpt-5-mini"] } },
			false,
		);
		expect(s.transport).toBe("gateway");
		expect(s.resumeEnabled).toBe(false);
		expect(s.warnings.join(" ")).toMatch(/resume disabled/);
	});

	it("moves caching to the gateway path and warns", () => {
		expect(selectTransport({ cacheTtl: 3600 }, false).transport).toBe("gateway");
		expect(selectTransport({ skipCache: true }, false).warnings).not.toHaveLength(0);
	});

	it("client fallback stays on the run path with resume", () => {
		const s = selectTransport(
			{ fallback: { mode: "client", models: ["openai/gpt-5-mini"] } },
			false,
		);
		expect(s.transport).toBe("run");
		expect(s.resumeEnabled).toBe(true);
	});

	it("throws when resume:true conflicts with server fallback", () => {
		expect(() =>
			selectTransport({ fallback: { mode: "server", models: ["openai/gpt-5-mini"] } }, true),
		).toThrow(/resume:true conflicts/);
	});

	it("throws when resume:true conflicts with caching", () => {
		expect(() => selectTransport({ cacheTtl: 60 }, true)).toThrow(/resume:true conflicts/);
	});

	it('throws when transport:"run" cannot satisfy a gateway-only feature', () => {
		expect(() => selectTransport({ transport: "run", cacheTtl: 60 }, false)).toThrow(
			/transport:"run" cannot satisfy/,
		);
	});

	it('throws when transport:"gateway" is asked for resume', () => {
		expect(() => selectTransport({ transport: "gateway" }, true)).toThrow(
			/cannot provide resume/,
		);
	});

	it('honors the transport:"gateway" escape hatch without warnings', () => {
		const s = selectTransport({ transport: "gateway" }, false);
		expect(s.transport).toBe("gateway");
		expect(s.resumeEnabled).toBe(false);
		expect(s.warnings).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// createGatewayDelegate (wiring — stub plugin, no live AI SDK needed)
// ---------------------------------------------------------------------------

const stubPlugin: ProviderPlugin = {
	resolverKey: "stub",
	create: ({ modelId }) =>
		({ specificationVersion: "v3", modelId }) as unknown as LanguageModelV3,
};
const fakeBinding = { run: vi.fn(), gateway: vi.fn() } as unknown as Ai;

describe("createGatewayDelegate", () => {
	it("throws without a binding", () => {
		expect(() => createGatewayDelegate({ providers: [stubPlugin] } as never)).toThrow(
			/requires a `binding`/,
		);
	});

	it("throws without providers", () => {
		expect(() => createGatewayDelegate({ binding: fakeBinding, providers: [] })).toThrow(
			/at least one provider plugin/,
		);
	});

	it("builds a model for a registered resolver key", () => {
		const wai = createGatewayDelegate({
			binding: fakeBinding,
			gateway: "default",
			providers: [stubPlugin],
		});
		const model = wai("stub/some-model");
		expect(model.modelId).toBe("some-model");
	});

	it("throws for an unregistered resolver key", () => {
		const wai = createGatewayDelegate({
			binding: fakeBinding,
			gateway: "default",
			providers: [stubPlugin],
		});
		expect(() => wai("openai/gpt-5")).toThrow(/No provider plugin for "openai"/);
	});

	it("requires a gateway (config or per-call)", () => {
		const wai = createGatewayDelegate({ binding: fakeBinding, providers: [stubPlugin] });
		expect(() => wai("stub/some-model")).toThrow(/A gateway is required/);
	});

	it("surfaces transport-conflict errors at model build time", () => {
		const wai = createGatewayDelegate({
			binding: fakeBinding,
			gateway: "default",
			providers: [stubPlugin],
		});
		expect(() =>
			wai("stub/some-model", {
				resume: true,
				fallback: { mode: "server", models: ["stub/other"] },
			}),
		).toThrow(GatewayDelegateError);
	});
});
