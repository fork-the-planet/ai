import { GatewayDelegateError } from "./gateway-delegate";

/**
 * Resumable run-path stream (RFC §7.1).
 *
 * Wraps the byte stream from a run-path response (`env.AI.run(..., {
 * returnRawResponse })`) so a transient mid-stream drop is recovered
 * transparently: the wrapper reconnects to the gateway resume endpoint and keeps
 * feeding bytes to the same consumer, so the downstream `@ai-sdk/*` parser never
 * sees the break.
 *
 * Byte alignment is the one correctness subtlety. The gateway `resume?from=N`
 * endpoint takes an SSE *event index* (count of `\n\n` terminators) and replays
 * whole events from that index. So the wrapper only ever emits *complete* events
 * downstream and buffers any trailing partial event. On a drop the buffered
 * partial is discarded and resume starts from the count of complete events
 * already emitted — landing exactly on the next event boundary, with no
 * duplicated or truncated bytes.
 *
 * Expiry: once the gateway buffer TTL (~5.5 min) elapses, resume returns 404
 * `{"error":"Request not found"}`. Behavior is governed by `onResumeExpired`:
 * `"error"` (default) surfaces a `GatewayDelegateError("resume-expired")` into
 * the stream; `"accept-partial"` ends the stream cleanly with whatever was
 * already delivered (the caller's higher layer — e.g. Think — can then continue
 * or regenerate).
 */

type AiWithFetch = Ai & {
	fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export type ResumeExpiredPolicy = "error" | "accept-partial";

export interface ResumableStreamOptions {
	/** Cloudflare AI binding (e.g. `env.AI`) — used for the resume fetch. */
	binding: Ai;
	/** Gateway id the run was issued under. */
	gateway: string;
	/** The `cf-aig-run-id` of the run to resume. */
	runId: string;
	/** Initial run-path response body. */
	initial: ReadableStream<Uint8Array>;
	/** What to do when the resume buffer has expired (404). Defaults to `"error"`. */
	onResumeExpired?: ResumeExpiredPolicy;
	/** Max reconnect attempts before giving up. Defaults to 5. */
	maxReconnects?: number;
	/** Fired before each reconnect with the resume `from` index and attempt number. */
	onReconnect?: (fromEvent: number, attempt: number) => void;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(new ArrayBuffer(a.length + b.length));
	out.set(a, 0);
	out.set(b, a.length);
	return out;
}

/** Index just past the last `\n\n` in `buf`, or -1 if there is no complete event. */
function lastEventBoundary(buf: Uint8Array): number {
	for (let i = buf.length - 2; i >= 0; i--) {
		if (buf[i] === 0x0a && buf[i + 1] === 0x0a) return i + 2;
	}
	return -1;
}

/** Count of `\n\n` terminators (= complete SSE events) in `buf`. */
function countEvents(buf: Uint8Array): number {
	let n = 0;
	for (let i = 0; i + 1 < buf.length; i++) {
		if (buf[i] === 0x0a && buf[i + 1] === 0x0a) {
			n++;
			i++; // don't double-count "\n\n\n"
		}
	}
	return n;
}

function resumeUrl(gateway: string, runId: string, from: number): string {
	return `https://workers-binding.ai/ai-gateway/gateways/${gateway}/run/${runId}/resume?from=${from}`;
}

export function createResumableStream(options: ResumableStreamOptions): ReadableStream<Uint8Array> {
	const { binding, gateway, runId } = options;
	const maxReconnects = options.maxReconnects ?? 5;
	const onExpired = options.onResumeExpired ?? "error";

	let emittedEvents = 0; // complete SSE events emitted downstream so far
	let pending: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0));
	let reconnects = 0;

	return new ReadableStream<Uint8Array>({
		async start(controller) {
			let current: ReadableStream<Uint8Array> = options.initial;

			for (;;) {
				const reader = current.getReader();
				try {
					for (;;) {
						const { done, value } = await reader.read();
						if (done) {
							if (pending.length > 0) {
								controller.enqueue(pending);
								pending = new Uint8Array(new ArrayBuffer(0));
							}
							controller.close();
							return;
						}
						if (!value || value.length === 0) continue;

						pending = concat(pending, value);
						const boundary = lastEventBoundary(pending);
						if (boundary > 0) {
							const complete = pending.slice(0, boundary);
							controller.enqueue(complete);
							emittedEvents += countEvents(complete);
							pending = pending.slice(boundary);
						}
					}
				} catch (err) {
					try {
						reader.releaseLock();
					} catch {
						// reader may already be released
					}

					if (reconnects >= maxReconnects) {
						controller.error(
							new GatewayDelegateError(
								"resume-expired",
								`Exceeded ${maxReconnects} reconnect attempts at event ${emittedEvents}.`,
								err,
							),
						);
						return;
					}

					// Discard the unfinished partial — resume realigns on the boundary.
					pending = new Uint8Array(new ArrayBuffer(0));
					reconnects++;
					options.onReconnect?.(emittedEvents, reconnects);

					let res: Response;
					try {
						res = await (binding as AiWithFetch).fetch(
							resumeUrl(gateway, runId, emittedEvents),
							{ method: "GET" },
						);
					} catch (fetchErr) {
						controller.error(
							new GatewayDelegateError(
								"dispatch",
								`Resume request threw at event ${emittedEvents}.`,
								fetchErr,
							),
						);
						return;
					}

					if (res.status === 404) {
						if (onExpired === "accept-partial") {
							controller.close();
							return;
						}
						controller.error(
							new GatewayDelegateError(
								"resume-expired",
								`Resume buffer expired (404) at event ${emittedEvents}. The gateway buffer ` +
									"TTL (~5.5 min) elapsed; fall back to continuation or regeneration.",
							),
						);
						return;
					}
					if (!res.ok || !res.body) {
						controller.error(
							new GatewayDelegateError(
								"dispatch",
								`Resume failed (${res.status}) at event ${emittedEvents}.`,
							),
						);
						return;
					}
					current = res.body;
				}
			}
		},
	});
}
