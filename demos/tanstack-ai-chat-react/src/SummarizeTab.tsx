import { useState } from "react";
import { useConfig } from "./config";

const PROVIDERS = {
	openai: {
		label: "OpenAI",
		model: "gpt-5.2",
		badge: "AI Gateway",
		badgeColor: "bg-amber-100 text-amber-700",
	},
	anthropic: {
		label: "Anthropic",
		model: "claude-opus-4-6",
		badge: "AI Gateway",
		badgeColor: "bg-amber-100 text-amber-700",
	},
	gemini: {
		label: "Gemini",
		model: "gemini-2.0-flash",
		badge: "AI Gateway",
		badgeColor: "bg-amber-100 text-amber-700",
	},
} as const;

type ProviderId = keyof typeof PROVIDERS;

const PLACEHOLDER_TEXT = `Cloudflare is a web infrastructure and security company that provides content delivery network (CDN) services, DDoS mitigation, Internet security, and distributed domain name server (DNS) services. Cloudflare's services sit between a website's visitor and the hosting provider, acting as a reverse proxy for websites. Its headquarters are in San Francisco, California, with additional offices in London, Singapore, Lisbon, and other cities around the world.

The company was founded in 2009 by Matthew Prince, Lee Holloway, and Michelle Zatlyn. It launched in September 2010 at TechCrunch Disrupt. The company has since grown to serve millions of websites and process a significant portion of internet traffic globally. In 2019, Cloudflare had its initial public offering (IPO) on the New York Stock Exchange.

Cloudflare Workers is a serverless application platform running on Cloudflare's global network in over 300 cities worldwide. Workers AI brings serverless GPU-powered machine learning directly to Cloudflare's network, allowing developers to run AI models with Workers AI bindings or the REST API. AI Gateway provides a unified control plane for managing and monitoring AI requests across multiple providers.`;

export function SummarizeTab() {
	const [selectedProvider, setSelectedProvider] = useState<ProviderId>("openai");
	const [text, setText] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [summary, setSummary] = useState<string | null>(null);
	const [summaryProvider, setSummaryProvider] = useState<ProviderId | null>(null);
	const [error, setError] = useState<string | null>(null);
	const { headers } = useConfig();

	const provider = PROVIDERS[selectedProvider];

	const handleSummarize = async (e: React.FormEvent) => {
		e.preventDefault();
		const inputText = text.trim() || PLACEHOLDER_TEXT;
		if (isLoading) return;

		setIsLoading(true);
		setError(null);
		setSummary(null);

		try {
			const res = await fetch(`/ai/summarize/${selectedProvider}`, {
				method: "POST",
				headers: { "Content-Type": "application/json", ...headers },
				body: JSON.stringify({ text: inputText }),
			});

			const data = await res.json();

			if (!res.ok) {
				setError((data as { error?: string }).error || "Summarization failed");
				return;
			}

			// TanStack AI summarize returns { summary: string }
			const result = data as { summary?: string };
			if (result.summary) {
				setSummary(result.summary);
				setSummaryProvider(selectedProvider);
			} else {
				setError("No summary was returned");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex flex-col h-full">
			{/* Provider selector */}
			<div className="px-4 sm:px-6 pt-4 pb-3 border-b border-gray-200 bg-white">
				<div className="flex items-center gap-3">
					<div className="flex gap-1.5">
						{Object.entries(PROVIDERS).map(([id, p]) => (
							<button
								key={id}
								type="button"
								onClick={() => setSelectedProvider(id as ProviderId)}
								className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
									id === selectedProvider
										? "bg-gray-900 text-white shadow-sm"
										: "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
								}`}
							>
								{p.label}
							</button>
						))}
					</div>
					<div className="flex items-center gap-2">
						<span
							className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${provider.badgeColor}`}
						>
							{provider.badge}
						</span>
						<span className="text-xs text-gray-400">{provider.model}</span>
					</div>
				</div>
			</div>

			{/* Error */}
			{error && (
				<div className="mx-4 sm:mx-6 mt-3 px-3 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
					{error}
				</div>
			)}

			{/* Content */}
			<div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
				{/* Text input area */}
				<div>
					<label
						htmlFor="summarize-input"
						className="block text-xs font-medium text-gray-700 mb-1.5"
					>
						Text to summarize
					</label>
					<textarea
						id="summarize-input"
						value={text}
						onChange={(e) => setText(e.target.value)}
						placeholder={PLACEHOLDER_TEXT}
						rows={8}
						disabled={isLoading}
						className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-y"
					/>
					<div className="flex items-center justify-between mt-2">
						<p className="text-[10px] text-gray-400">
							{text.trim()
								? `${text.trim().length} characters`
								: "Leave empty to use the sample text above"}
						</p>
						<button
							type="button"
							onClick={handleSummarize}
							disabled={isLoading}
							className="px-5 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
						>
							{isLoading ? (
								<div className="flex items-center gap-2">
									<svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
										<title>Loading</title>
										<circle
											className="opacity-25"
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											strokeWidth="4"
											fill="none"
										/>
										<path
											className="opacity-75"
											fill="currentColor"
											d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
										/>
									</svg>
									Summarizing...
								</div>
							) : (
								"Summarize"
							)}
						</button>
					</div>
				</div>

				{/* Summary output */}
				{summary && summaryProvider && (
					<div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
						<div className="flex items-center gap-2 mb-3">
							<span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-blue-100 text-blue-700">
								{PROVIDERS[summaryProvider].label}
							</span>
							<span className="text-[10px] text-gray-400">
								{PROVIDERS[summaryProvider].model}
							</span>
						</div>
						<div className="text-sm text-gray-900 leading-relaxed whitespace-pre-wrap">
							{summary}
						</div>
					</div>
				)}

				{/* Empty state */}
				{!summary && !isLoading && (
					<div className="flex items-center justify-center py-12">
						<div className="text-center max-w-sm">
							<div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center mx-auto mb-4">
								<svg
									className="w-6 h-6 text-white"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={2}
								>
									<title>Summarize</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
									/>
								</svg>
							</div>
							<p className="text-sm font-medium text-gray-900 mb-1">
								Summarize text with AI
							</p>
							<p className="text-xs text-gray-500 leading-relaxed">
								Paste your text above or use the sample, then select a provider to
								generate a summary. All requests are routed through Cloudflare AI
								Gateway.
							</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
