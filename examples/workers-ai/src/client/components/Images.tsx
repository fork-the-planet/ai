import { useState } from "react";
import { imageModels } from "./models";

export function Images() {
	const [model, setModel] = useState(imageModels[0].id);
	const [prompt, setPrompt] = useState("");
	const [image, setImage] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleGenerate = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!prompt.trim() || loading) return;

		setLoading(true);
		setError(null);
		setImage(null);

		try {
			const res = await fetch("/api/image", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt, model }),
			});

			if (!res.ok) {
				const body = (await res.json()) as { error?: string };
				throw new Error(body.error || `HTTP ${res.status}`);
			}

			const data = (await res.json()) as { image: string };
			setImage(data.image);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to generate image");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="tab-content">
			<div className="toolbar">
				<label>
					Model
					<select value={model} onChange={(e) => setModel(e.target.value)}>
						{imageModels.map((m) => (
							<option key={m.id} value={m.id}>
								{m.label}
							</option>
						))}
					</select>
				</label>
			</div>

			<form className="input-bar" onSubmit={handleGenerate}>
				<input
					type="text"
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder="Describe the image you want to generate..."
					disabled={loading}
				/>
				<button type="submit" disabled={loading || !prompt.trim()}>
					{loading ? "Generating..." : "Generate"}
				</button>
			</form>

			<div className="image-output">
				{loading && (
					<div className="loading-spinner">
						<div className="spinner" />
						Generating image...
					</div>
				)}
				{error && <div className="error">{error}</div>}
				{image && <img src={image} alt={prompt} className="generated-image" />}
				{!image && !loading && !error && (
					<div className="empty-state">
						Enter a prompt and click Generate to create an image.
					</div>
				)}
			</div>
		</div>
	);
}
