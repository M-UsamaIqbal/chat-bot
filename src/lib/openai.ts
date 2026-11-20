import OpenAI from "openai";

let client: OpenAI | null = null;

/**
 * Provider-agnostic chat client built on the OpenAI SDK.
 *
 * The SDK speaks the OpenAI Chat Completions protocol, which is also exposed by
 * free, OpenAI-compatible providers (Groq, Google Gemini, Ollama, OpenRouter…).
 * Point it at one by setting AI_BASE_URL + AI_API_KEY; with no base URL it talks
 * to OpenAI directly.
 *
 * Server-side only — never import into a client component.
 */
export function getAI(): OpenAI {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No AI API key set. Add AI_API_KEY (e.g. a free Groq key) or OPENAI_API_KEY to .env.local — see .env.example."
    );
  }
  if (!client) {
    const baseURL =
      process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || undefined;
    client = new OpenAI({ apiKey, baseURL });
  }
  return client;
}

/** Backwards-compatible alias. */
export const getOpenAI = getAI;

/** Default model: Groq's free Llama 3.3 70B unless overridden. */
export const CHAT_MODEL =
  process.env.AI_MODEL ||
  process.env.OPENAI_MODEL ||
  "llama-3.3-70b-versatile";
