import { GoogleGenAI } from '@google/genai';

// Initialize Gemini client when key is available (reads process.env dynamically on call)
export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'YOUR_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

// Fallback verified model identifier
export const FALLBACK_MODEL = 'gemini-3.5-flash-lite';

// Default model configured via environment variable, falling back to verified model
export function getDefaultModel(): string {
  return process.env.GEMINI_MODEL || FALLBACK_MODEL;
}

export const DEFAULT_MODEL = getDefaultModel();

export interface LLMCallResult {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export type GeminiErrorCategory =
  | 'RATE_LIMIT'
  | 'SERVER_ERROR'
  | 'AUTHENTICATION'
  | 'MODEL_UNAVAILABLE'
  | 'CLIENT_ERROR'
  | 'UNKNOWN';

export interface SanitizedGeminiError {
  status: number | null;
  category: GeminiErrorCategory;
  isTransient: boolean;
  message: string;
}

/**
 * Extracts HTTP status code and sanitized category from an error without exposing secrets.
 */
export function sanitizeGeminiError(err: any): SanitizedGeminiError {
  let status: number | null = null;

  if (typeof err?.status === 'number') {
    status = err.status;
  } else if (typeof err?.statusCode === 'number') {
    status = err.statusCode;
  } else if (typeof err?.message === 'string') {
    // Attempt parsing JSON error body if present in message
    try {
      const parsed = JSON.parse(err.message);
      if (typeof parsed?.error?.code === 'number') {
        status = parsed.error.code;
      }
    } catch {
      // Not JSON, extract status via regex if available
      const match = err.message.match(/\b(400|401|403|404|429|500|502|503|504)\b/);
      if (match) {
        status = parseInt(match[1], 10);
      }
    }
  }

  let category: GeminiErrorCategory = 'UNKNOWN';
  let isTransient = false;

  if (status === 429) {
    category = 'RATE_LIMIT';
    isTransient = true;
  } else if (status && status >= 500 && status <= 599) {
    category = 'SERVER_ERROR';
    isTransient = true;
  } else if (status === 401 || status === 403) {
    category = 'AUTHENTICATION';
    isTransient = false;
  } else if (status === 404) {
    category = 'MODEL_UNAVAILABLE';
    isTransient = false;
  } else if (status && status >= 400 && status < 500) {
    category = 'CLIENT_ERROR';
    isTransient = false;
  }

  // Sanitize message: never reveal raw headers, authorization or API keys
  let rawMsg = typeof err?.message === 'string' ? err.message : 'Unknown Gemini error';
  rawMsg = rawMsg.replace(/AIza[0-9A-Za-z-_]{35}/g, '[REDACTED_API_KEY]');
  rawMsg = rawMsg.replace(/key=[^&\s]+/g, 'key=[REDACTED]');

  return {
    status,
    category,
    isTransient,
    message: rawMsg,
  };
}

export async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  responseSchema?: Record<string, any>
): Promise<LLMCallResult> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY is not configured. Falling back to deterministic mock runner.');
  }

  const config: Record<string, any> = {
    systemInstruction: systemPrompt,
    temperature: 0.1, // Low temperature for high factual precision
  };

  if (responseSchema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = responseSchema;
  }

  const modelToUse = getDefaultModel();

  try {
    const response = await ai.models.generateContent({
      model: modelToUse,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config,
    });

    const text = response.text || '';
    const usageMetadata = response.usageMetadata;

    return {
      text,
      usage: usageMetadata
        ? {
            promptTokens: usageMetadata.promptTokenCount || 0,
            completionTokens: usageMetadata.candidatesTokenCount || 0,
            totalTokens: usageMetadata.totalTokenCount || 0,
          }
        : undefined,
    };
  } catch (err: any) {
    const sanitized = sanitizeGeminiError(err);

    // Determine if fallback is applicable (e.g. transient 5xx/429 or deprecated/unavailable 404 model)
    const canFallback =
      modelToUse !== FALLBACK_MODEL &&
      (sanitized.isTransient || sanitized.category === 'MODEL_UNAVAILABLE');

    if (canFallback) {
      const reasonDesc = sanitized.isTransient
        ? `transient error (${sanitized.category}, HTTP ${sanitized.status || 'unknown'})`
        : `model issue (${sanitized.category}, HTTP ${sanitized.status || 'unknown'})`;

      console.warn(
        `[callGemini] Primary model ${modelToUse} failed due to ${reasonDesc}. Falling back to ${FALLBACK_MODEL}...`
      );

      try {
        const fallbackResponse = await ai.models.generateContent({
          model: FALLBACK_MODEL,
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          config,
        });

        const text = fallbackResponse.text || '';
        const usageMetadata = fallbackResponse.usageMetadata;

        return {
          text,
          usage: usageMetadata
            ? {
                promptTokens: usageMetadata.promptTokenCount || 0,
                completionTokens: usageMetadata.candidatesTokenCount || 0,
                totalTokens: usageMetadata.totalTokenCount || 0,
              }
            : undefined,
        };
      } catch (fallbackErr: any) {
        const fallbackSanitized = sanitizeGeminiError(fallbackErr);
        console.error(
          `[callGemini] Fallback model ${FALLBACK_MODEL} also failed: [${fallbackSanitized.category}] HTTP ${fallbackSanitized.status || 'unknown'}: ${fallbackSanitized.message}`
        );
        throw fallbackErr;
      }
    }

    console.error(
      `[callGemini] Model ${modelToUse} failed without fallback: [${sanitized.category}] HTTP ${sanitized.status || 'unknown'}: ${sanitized.message}`
    );
    throw err;
  }
}
