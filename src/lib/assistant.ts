import "server-only";
import { env } from "./env";

/**
 * Optional LLM synthesis over retrieved minutes/resolutions snippets.
 * Uses the Anthropic Messages API with the latest Claude model. When no API key
 * is configured, the caller falls back to plain search results.
 */
export async function synthesizeAnswer(question: string, context: string): Promise<string | null> {
  if (!env.anthropic.enabled) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.anthropic.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.anthropic.model,
        max_tokens: 700,
        system:
          "You are a board-secretariat assistant. Answer ONLY from the provided minutes and resolutions excerpts. " +
          "Cite the meeting/resolution title in brackets. If the answer is not in the excerpts, say you could not find it. Be concise.",
        messages: [{ role: "user", content: `Question: ${question}\n\nExcerpts:\n${context}` }],
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[assistant] Anthropic API error", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    return data.content?.map((c) => c.text ?? "").join("").trim() || null;
  } catch (err) {
    console.error("[assistant] request failed", err);
    return null;
  }
}
