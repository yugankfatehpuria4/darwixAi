// Gemini over plain fetch. One provider, no SDK: the request is small enough
// to read in full, and fetch gives us AbortController timeouts for free.

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export type LlmResult =
  | { ok: true; text: string; ms: number; prompt_tokens: number; output_tokens: number }
  | { ok: false; error: string; ms: number };

export function llmConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY) && process.env.LLM_MODE !== "off";
}

export async function generateJson(system: string, user: string, timeoutMs: number): Promise<LlmResult> {
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);
  if (!llmConfigured()) return { ok: false, error: "llm_not_configured", ms: 0 };

  // Google's model list (checked 2026-10-02) recommends 3.5 Flash-Lite for
  // new projects; it is also the cheapest stable model, which suits short
  // voice answers. Override with GEMINI_MODEL.
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        // Header, not ?key= in the URL, so the key never lands in proxy or access logs.
        "x-goog-api-key": process.env.GEMINI_API_KEY!,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 300,
          responseMimeType: "application/json",
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `http_${response.status}: ${body.slice(0, 160)}`, ms: elapsed() };
    }
    const payload = (await response.json()) as GeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    if (!text) return { ok: false, error: `empty_candidate (finishReason=${payload?.candidates?.[0]?.finishReason ?? "none"})`, ms: elapsed() };
    return {
      ok: true,
      text,
      ms: elapsed(),
      prompt_tokens: payload?.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: payload?.usageMetadata?.candidatesTokenCount ?? 0,
    };
  } catch (error) {
    const reason = (error as Error).name === "AbortError" ? `timeout_after_${timeoutMs}ms` : `network: ${(error as Error).message}`;
    return { ok: false, error: reason, ms: elapsed() };
  } finally {
    clearTimeout(timer);
  }
}
