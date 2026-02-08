import { useState } from "react";
import { useConfig } from "./config";

const PROVIDERS = {
	openai: {
		label: "OpenAI",
		model: "gpt-image-1",
		badge: "AI Gateway",
		badgeColor: "bg-amber-100 text-amber-700",
	},
	gemini: {
		label: "Gemini",
		model: "imagen-4.0-generate-001",
		badge: "AI Gateway",
		badgeColor: "bg-amber-100 text-amber-700",
	},
	grok: {
		label: "Grok",
		model: "grok-2-image-1212",
		badge: "AI Gateway",
		badgeColor: "bg-amber-100 text-amber-700",
	},
} as const;

type ProviderId = keyof typeof PROVIDERS;

interface GeneratedImage {
	id: string;
	provider: ProviderId;
	prompt: string;
	url?: string;
	b64Json?: string;
	error?: string;
}

export function ImageTab() {
	const [selectedProvider, setSelectedProvider] = useState<ProviderId>("openai");
	const [prompt, setPrompt] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [images, setImages] = useState<GeneratedImage[]>([]);
	const [error, setError] = useState<string | null>(null);
	const { headers } = useConfig();

	const provider = PROVIDERS[selectedProvider];

	const handleGenerate = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!prompt.trim() || isLoading) return;

		setIsLoading(true);
		setError(null);

		try {
			const res = await fetch(`/ai/image/${selectedProvider}`, {
				method: "POST",
				headers: { "Content-Type": "application/json", ...headers },
				body: JSON.stringify({ prompt }),
			});

			const data = await res.json();

			if (!res.ok) {
				setError((data as { error?: string }).error || "Image generation failed");
				return;
			}

			// TanStack AI generateImage returns { images: [{ b64Json?, url? }] }
			const result = data as {
				images?: Array<{ b64Json?: string; url?: string }>;
			};
			const img = result.images?.[0];

			if (img) {
				setImages((prev) => [
					{
						id: crypto.randomUUID(),
						provider: selectedProvider,
						prompt,
						url: img.url,
						b64Json: img.b64Json,
					},
					...prev,
				]);
				setPrompt("");
			} else {
				setError("No image was returned");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex flex-col h-full">
			{/* Provider selector + input */}
			<div className="px-4 sm:px-6 pt-4 pb-4 border-b border-gray-200 bg-white space-y-3">
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

				<form onSubmit={handleGenerate} className="flex gap-2">
					<input
						type="text"
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder="Describe the image you want to generate..."
						disabled={isLoading}
						className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
					/>
					<button
						type="submit"
						disabled={isLoading || !prompt.trim()}
						className="px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
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
								Generating...
							</div>
						) : (
							"Generate"
						)}
					</button>
				</form>
			</div>

			{/* Error */}
			{error && (
				<div className="mx-4 sm:mx-6 mt-3 px-3 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
					{error}
				</div>
			)}

			{/* Image gallery */}
			<div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
				{images.length === 0 && !isLoading ? (
					<div className="h-full flex items-center justify-center">
						<div className="text-center max-w-sm">
							<div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center mx-auto mb-4">
								<svg
									className="w-6 h-6 text-white"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={2}
								>
									<title>Image</title>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
									/>
								</svg>
							</div>
							<p className="text-sm font-medium text-gray-900 mb-1">
								Generate images with AI
							</p>
							<p className="text-xs text-gray-500 leading-relaxed">
								Describe what you want to see and select a provider. All requests
								are routed through Cloudflare AI Gateway.
							</p>
							<div className="mt-4 flex flex-wrap gap-1.5 justify-center">
								{[
									"A cat astronaut floating in space",
									"A cozy cabin in the snow",
									"Abstract neon cityscape",
								].map((example) => (
									<button
										key={example}
										type="button"
										onClick={() => setPrompt(example)}
										className="px-3 py-1.5 rounded-full text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors"
									>
										{example}
									</button>
								))}
							</div>
						</div>
					</div>
				) : (
					<div className="grid grid-cols-1 gap-4">
						{isLoading && (
							<div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
								<div className="flex items-center gap-3">
									<div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
										<svg
											className="animate-spin h-5 w-5 text-gray-400"
											viewBox="0 0 24 24"
										>
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
									</div>
									<div>
										<p className="text-sm font-medium text-gray-900">
											Generating with {PROVIDERS[selectedProvider].label}...
										</p>
										<p className="text-xs text-gray-500 mt-0.5">{prompt}</p>
									</div>
								</div>
							</div>
						)}

						{images.map((img) => (
							<div
								key={img.id}
								className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm"
							>
								{img.error ? (
									<div className="p-4 text-sm text-red-600">{img.error}</div>
								) : (
									<img
										src={
											img.b64Json
												? `data:image/png;base64,${img.b64Json}`
												: img.url
										}
										alt={img.prompt}
										className="w-full"
									/>
								)}
								<div className="px-4 py-3 border-t border-gray-100">
									<div className="flex items-center gap-2 mb-1">
										<span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-violet-100 text-violet-700">
											{PROVIDERS[img.provider].label}
										</span>
										<span className="text-[10px] text-gray-400">
											{PROVIDERS[img.provider].model}
										</span>
									</div>
									<p className="text-xs text-gray-600">{img.prompt}</p>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
