import { APICallError } from "@ai-sdk/provider";

/**
 * Workers AI internal error code → HTTP status code.
 *
 * The Workers AI **binding** (`env.AI.run`) throws plain `Error`s whose message
 * carries the internal code (e.g. `"3040: Capacity temporarily exceeded"`) but
 * no HTTP status. The AI SDK's retry machinery only retries `APICallError`s
 * whose `statusCode` is retryable (408 / 409 / 429 / >= 500), so we translate
 * the internal code into the documented HTTP status and let `APICallError`
 * derive retryability from it — this is what makes transient failures like
 * "out of capacity" (3040 → 429) automatically retried.
 *
 * Source: https://developers.cloudflare.com/workers-ai/platform/errors/
 */
export const WORKERS_AI_ERROR_CODE_TO_STATUS: Record<number, number> = {
	5007: 400, // No such model
	5004: 400, // Invalid data
	3039: 400, // Finetune missing required files
	3003: 400, // Incomplete request
	5018: 403, // Account not allowed for private model
	5016: 403, // Model agreement not accepted
	3023: 403, // Account blocked
	3041: 403, // Account not allowed for private model
	5019: 405, // Deprecated SDK version
	5005: 405, // LoRa unsupported
	3042: 404, // Invalid model ID
	3006: 413, // Request too large
	3007: 408, // Timeout
	3008: 408, // Aborted
	3036: 429, // Account limited (daily free allocation used up)
	3040: 429, // Out of capacity (no data center to forward to)
};

/**
 * Best-effort extraction of a Workers AI internal error code from a thrown
 * binding error. Prefers a numeric `code` property when present, otherwise
 * parses the `"<code>: <message>"` form the binding uses (optionally prefixed,
 * e.g. `"InferenceUpstreamError: 3040: ..."`). Only recognized codes are
 * returned, and when several `"<number>:"` groups appear (e.g. a leading
 * request id) the first that maps to a known code wins, so unrelated numbers
 * can't be misread as a code.
 */
export function parseWorkersAIErrorCode(error: unknown): number | undefined {
	if (error && typeof error === "object") {
		const code = (error as { code?: unknown }).code;
		if (typeof code === "number" && code in WORKERS_AI_ERROR_CODE_TO_STATUS) {
			return code;
		}
		if (typeof code === "string") {
			const parsed = Number.parseInt(code, 10);
			if (Number.isFinite(parsed) && parsed in WORKERS_AI_ERROR_CODE_TO_STATUS) {
				return parsed;
			}
		}
	}

	const message = messageOf(error);
	for (const match of message.matchAll(/\b(\d{3,5})\s*:/g)) {
		const parsed = Number.parseInt(match[1]!, 10);
		if (parsed in WORKERS_AI_ERROR_CODE_TO_STATUS) {
			return parsed;
		}
	}

	return undefined;
}

/** Read a human-readable message from any thrown value (Error, DOMException, plain object, string). */
function messageOf(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	if (error && typeof error === "object") {
		const message = (error as { message?: unknown }).message;
		if (typeof message === "string") return message;
	}
	return String(error);
}

/**
 * True for cancellation errors that must propagate untouched (never wrapped, so
 * the AI SDK's own abort detection still fires). Mirrors the AI SDK's
 * `isAbortError`: a real abort from `fetch`/the binding is a `DOMException`,
 * which is NOT `instanceof Error`, so both must be checked.
 */
function isAbortError(error: unknown): boolean {
	return (
		(error instanceof Error || error instanceof DOMException) &&
		(error.name === "AbortError" ||
			error.name === "ResponseAborted" ||
			error.name === "TimeoutError")
	);
}

/** Serialize `Headers` to the plain object shape `APICallError` expects. */
function headersToObject(headers: Headers): Record<string, string> {
	const out: Record<string, string> = {};
	headers.forEach((value, key) => {
		out[key] = value;
	});
	return out;
}

/**
 * Normalize an error thrown by the Workers AI **binding** (`env.AI.run`) into an
 * `APICallError` so the AI SDK can classify and retry it.
 *
 * Cancellations (`AbortError` / `TimeoutError` / `ResponseAborted`, including
 * `DOMException` aborts) and errors that are already an `APICallError` pass
 * through unchanged. Everything else becomes an
 * `APICallError`; when the internal code maps to a known HTTP status, that
 * `statusCode` is attached and `APICallError` derives `isRetryable` from it.
 * Unrecognized errors get no `statusCode`, so they stay non-retryable (the
 * prior behavior).
 */
export function normalizeBindingError(
	error: unknown,
	context: { model: string; requestBodyValues: unknown },
): unknown {
	if (APICallError.isInstance(error) || isAbortError(error)) {
		return error;
	}

	const code = parseWorkersAIErrorCode(error);
	const statusCode = code != null ? WORKERS_AI_ERROR_CODE_TO_STATUS[code] : undefined;
	const message = messageOf(error);

	return new APICallError({
		message,
		url: `workers-ai:binding/run/${context.model}`,
		requestBodyValues: context.requestBodyValues,
		statusCode,
		responseBody: message,
		cause: error,
		...(code != null ? { data: { workersAIErrorCode: code } } : {}),
	});
}

/**
 * Build an `APICallError` from a non-OK Workers AI **REST** response. The HTTP
 * status is authoritative here, so `APICallError` derives `isRetryable` from it
 * directly (429 / 5xx → retryable). Response headers are preserved so the AI
 * SDK can honor `Retry-After`. The message keeps the historical
 * `"Workers AI API error (<status> <statusText>): <body>"` shape.
 */
export function apiCallErrorFromResponse(
	response: Response,
	errorBody: string,
	context: { url: string; requestBodyValues: unknown },
): APICallError {
	return new APICallError({
		message: `Workers AI API error (${response.status} ${response.statusText}): ${errorBody}`,
		url: context.url,
		requestBodyValues: context.requestBodyValues,
		statusCode: response.status,
		responseHeaders: headersToObject(response.headers),
		responseBody: errorBody,
	});
}
