/**
 * Shared Gemini API caller for Mimi Sub-Brains
 * Handles multi-model fallback, timeout handling, and vision multimodal payloads.
 */

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_GEMINI_API_KEY ||
  process.env.GOOGLE_AI_API_KEY ||
  "";

// Ranked model fallback list for high availability and low latency
export const GEMINI_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.6-flash",
];

export interface GeminiCallParams {
  prompt: string;
  imagePart?: { mimeType: string; data: string };
  temperature?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

export function sanitizeMimiOutput(text: string): string {
  return text
    .replace(/งื้อออ+/gi, "")
    .replace(/ใจจะขาด/gi, "")
    .replace(/คนดีของมิมิ/gi, "คุณลูกค้า")
    .replace(/คนดี/gi, "คุณลูกค้า")
    .replace(/รับน้องไปดูแล/gi, "สั่งซื้อ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function callGeminiForMimi(params: GeminiCallParams): Promise<string | null> {
  const {
    prompt,
    imagePart,
    temperature = 0.2,
    maxOutputTokens = 120,
    timeoutMs = 18000,
  } = params;

  if (!GEMINI_API_KEY) {
    console.warn("[GeminiClient] No GEMINI_API_KEY configured.");
    return null;
  }

  for (const model of GEMINI_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const parts: any[] = [{ text: prompt }];
      if (imagePart && imagePart.data) {
        parts.push({
          inlineData: {
            mimeType: imagePart.mimeType,
            data: imagePart.data,
          },
        });
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature,
            maxOutputTokens,
            thinkingConfig: {
              thinkingBudget: 0,
            },
          },
        }),
      });

      clearTimeout(timeoutId);
      if (!res.ok) {
        console.warn(`[GeminiClient] Model ${model} returned status ${res.status}`);
        continue;
      }

      const data = await res.json();
      const candidateParts = data?.candidates?.[0]?.content?.parts || [];
      const textPart = candidateParts.find((p: any) => p.text && !p.thought) || candidateParts[candidateParts.length - 1];
      const rawText = textPart?.text;
      if (rawText && rawText.trim().length > 0) {
        return sanitizeMimiOutput(rawText);
      }
    } catch (e: any) {
      console.warn(`[GeminiClient] Error with model ${model}:`, e?.message || e);
    }
  }

  return null;
}
