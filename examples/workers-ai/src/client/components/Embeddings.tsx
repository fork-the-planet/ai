import { useState } from "react";
import { embeddingModels } from "./models";

interface EmbedResult {
	embeddings: Array<{ dimensions: number; preview: number[] }>;
	similarities: number[][];
}

export function Embeddings() {
	const [model, setModel] = useState(embeddingModels[0].id);
	const [text1, setText1] = useState("The weather is beautiful today");
	const [text2, setText2] = useState("It's a gorgeous sunny afternoon");
	const [result, setResult] = useState<EmbedResult | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleCompare = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!text1.trim() || !text2.trim() || loading) return;

		setLoading(true);
		setError(null);

		try {
			const res = await fetch("/api/embed", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ texts: [text1, text2], model }),
			});

			if (!res.ok) {
				const body = (await res.json()) as { error?: string };
				throw new Error(body.error || `HTTP ${res.status}`);
			}

			const data = (await res.json()) as EmbedResult;
			setResult(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to embed");
		} finally {
			setLoading(false);
		}
	};

	const similarity = result?.similarities?.[0]?.[1];

	return (
		<div className="tab-content">
			<div className="toolbar">
				<label>
					Model
					<select value={model} onChange={(e) => setModel(e.target.value)}>
						{embeddingModels.map((m) => (
							<option key={m.id} value={m.id}>
								{m.label}
							</option>
						))}
					</select>
				</label>
			</div>

			<form className="embed-form" onSubmit={handleCompare}>
				<div className="embed-inputs">
					<textarea
						value={text1}
						onChange={(e) => setText1(e.target.value)}
						placeholder="First text..."
						rows={3}
					/>
					<textarea
						value={text2}
						onChange={(e) => setText2(e.target.value)}
						placeholder="Second text..."
						rows={3}
					/>
				</div>
				<button type="submit" disabled={loading || !text1.trim() || !text2.trim()}>
					{loading ? "Computing..." : "Compare"}
				</button>
			</form>

			{error && <div className="error">{error}</div>}

			{result && similarity != null && (
				<div className="embed-result">
					<div
						className="similarity-score"
						data-level={similarity > 0.8 ? "high" : similarity > 0.5 ? "medium" : "low"}
					>
						<div className="score-label">Cosine Similarity</div>
						<div className="score-value">{similarity.toFixed(4)}</div>
						<div className="score-bar">
							<div
								className="score-fill"
								style={{
									width: `${Math.max(0, similarity) * 100}%`,
								}}
							/>
						</div>
					</div>

					<div className="embed-details">
						{result.embeddings.map((emb, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: index is used as key
							<div key={i} className="embed-vector">
								<div className="embed-label">
									Text {i + 1} ({emb.dimensions} dimensions)
								</div>
								<code>
									[{emb.preview.map((v) => v.toFixed(4)).join(", ")}, ...]
								</code>
							</div>
						))}
					</div>
				</div>
			)}

			{!result && !loading && !error && (
				<div className="empty-state">
					Enter two texts and click Compare to see how semantically similar they are.
				</div>
			)}
		</div>
	);
}
