import { GoogleGenAI } from "@google/genai";
import { retryWithBackoff } from "@/lib/retryWithBackoff";
import {
  extractOpenAiText,
  logOpenAiResponseInspection,
  parseJsonFromOpenAiText,
} from "@/lib/openAiResponseParser";
import {
  getAiFallbackUserMessage,
  getAiProviderStatus,
  isAiGloballyBlocked,
  isProviderBlocked,
  markProviderFailure,
  markProviderSuccess,
} from "@/lib/aiProviderStatus";

export {
  getAiFallbackUserMessage,
  getAiProviderStatus,
  isAiGloballyBlocked,
  isProviderBlocked,
};

const AI_TIMEOUT_MS = 55_000;
const OPENAI_RESPONSES_TIMEOUT_MS = 55_000;
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_OPENROUTER_MODEL = "google/gemini-2.5-flash";
const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const OPENROUTER_API_URL =
  "https://openrouter.ai/api/v1/chat/completions";
const OPENAI_CHAT_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 4096;

export type AiProviderName = "gemini" | "openrouter" | "openai";

export interface AiConfig {
  provider:
    | "openai"
    | "gemini"
    | "openrouter"
    | "openai+gemini+openrouter"
    | "openai+gemini"
    | "openai+openrouter"
    | null;
  primaryProvider: AiProviderName;
  model: string;
  geminiApiKey: string | undefined;
  geminiModel: string;
  openRouterApiKey: string | undefined;
  openRouterModel: string;
  openAiApiKey: string | undefined;
  openAiModel: string;
}

export interface AiConnectionTestResult {
  success: boolean;
  error?: string;
  response?: string;
  provider?: AiProviderName;
}

let geminiClient: GoogleGenAI | null = null;
let connectionTestResult: AiConnectionTestResult | null = null;
let connectionTestPromise: Promise<AiConnectionTestResult> | null = null;
let activeAiModel: string | null = null;

export function getAiConfig(): AiConfig {
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  const openRouterApiKey = process.env.OPENROUTER_API_KEY?.trim();
  const openAiApiKey =
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.AI_API_KEY?.trim() ||
    process.env.OPENAI_KEY?.trim();
  const geminiModel =
    process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const openRouterModel =
    process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
  const openAiModel =
    process.env.OPENAI_MODEL?.trim() ||
    process.env.AI_MODEL?.trim() ||
    DEFAULT_OPENAI_MODEL;

  const hasGemini = Boolean(geminiApiKey);
  const hasOpenRouter = Boolean(openRouterApiKey);
  const hasOpenAi = Boolean(openAiApiKey);

  const configuredPrimary = (
    process.env.AI_PROVIDER?.trim().toLowerCase() || "openai"
  ) as AiProviderName;

  // OpenAI is always primary when its key is present.
  const primaryProvider: AiProviderName = hasOpenAi
    ? "openai"
    : configuredPrimary === "gemini" && hasGemini
      ? "gemini"
      : configuredPrimary === "openrouter" && hasOpenRouter
        ? "openrouter"
        : hasGemini
          ? "gemini"
          : hasOpenRouter
            ? "openrouter"
            : "openai";

  let provider: AiConfig["provider"] = null;
  if (hasOpenAi) {
    if (hasGemini && hasOpenRouter) provider = "openai+gemini+openrouter";
    else if (hasGemini) provider = "openai+gemini";
    else if (hasOpenRouter) provider = "openai+openrouter";
    else provider = "openai";
  } else if (hasGemini) {
    provider = "gemini";
  } else if (hasOpenRouter) {
    provider = "openrouter";
  }

  const model =
    primaryProvider === "openai"
      ? openAiModel
      : primaryProvider === "gemini"
        ? geminiModel
        : openRouterModel;

  return {
    provider,
    primaryProvider,
    model,
    geminiApiKey,
    geminiModel,
    openRouterApiKey,
    openRouterModel,
    openAiApiKey,
    openAiModel,
  };
}

export function getAiProviderSummary(): {
  activeProvider: string;
  activeModel: string;
  backupProviders: string[];
} {
  const config = getAiConfig();
  const backups: string[] = [];

  if (config.primaryProvider === "openai") {
    if (config.geminiApiKey) backups.push(`Gemini (${config.geminiModel})`);
    if (config.openRouterApiKey) backups.push(`OpenRouter (${config.openRouterModel})`);
  } else if (config.primaryProvider === "gemini" && config.openRouterApiKey) {
    backups.push(`OpenRouter (${config.openRouterModel})`);
  }

  const activeProvider =
    config.primaryProvider === "openai"
      ? "OpenAI"
      : config.primaryProvider === "gemini"
        ? "Gemini"
        : "OpenRouter";

  return {
    activeProvider,
    activeModel: config.model,
    backupProviders: backups,
  };
}

export function isAiConfigured(): boolean {
  const config = getAiConfig();
  return Boolean(
    config.openAiApiKey || config.geminiApiKey || config.openRouterApiKey
  );
}

/** True when at least one provider has a key and is not temporarily blocked. */
export function isAiAvailable(): boolean {
  if (!isAiConfigured() || isAiGloballyBlocked()) {
    return false;
  }

  const config = getAiConfig();
  return (
    (Boolean(config.openAiApiKey) && !isProviderBlocked("openai")) ||
    (Boolean(config.geminiApiKey) && !isProviderBlocked("gemini")) ||
    (Boolean(config.openRouterApiKey) && !isProviderBlocked("openrouter"))
  );
}

export function getAiKeyPresence(): {
  openai: boolean;
  gemini: boolean;
  openrouter: boolean;
} {
  const config = getAiConfig();
  return {
    openai: Boolean(config.openAiApiKey),
    gemini: Boolean(config.geminiApiKey),
    openrouter: Boolean(config.openRouterApiKey),
  };
}

export function logAiProviderStartup(): void {
  const config = getAiConfig();
  const summary = getAiProviderSummary();
  const keys = getAiKeyPresence();
  const configuredProvider = (
    process.env.AI_PROVIDER?.trim().toLowerCase() || "openai"
  );

  console.log(`[AI] OPENAI_API_KEY present: ${keys.openai ? "YES" : "NO"}`);
  console.log(`[AI] AI_PROVIDER: ${configuredProvider}`);
  console.log(`[AI] OPENAI_MODEL: ${config.openAiModel}`);
  console.log(
    `[AI] Primary provider: ${summary.activeProvider} (model: ${summary.activeModel})`
  );
  console.log(
    `[AI] API keys present — OpenAI: ${keys.openai ? "yes" : "no"}, Gemini: ${keys.gemini ? "yes" : "no"}, OpenRouter: ${keys.openrouter ? "yes" : "no"}`
  );

  if (summary.backupProviders.length > 0) {
    console.log(`[AI] Backup providers: ${summary.backupProviders.join(", ")}`);
  }

  if (!keys.openai && !keys.gemini && !keys.openrouter) {
    console.warn(
      "[AI] No API keys detected (OPENAI_API_KEY / GEMINI_API_KEY / OPENROUTER_API_KEY) — rule-based fallbacks will be used"
    );
  } else if (keys.openai) {
    console.log(`[AI] OpenAI is primary; Gemini/OpenRouter are fallback-only`);
  }
}

export function getActiveAiModel(): string | null {
  return activeAiModel;
}

function setActiveAiModel(model: string): void {
  activeAiModel = model;
}

function getGeminiClient(): GoogleGenAI {
  const { geminiApiKey } = getAiConfig();
  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: geminiApiKey });
  }
  return geminiClient;
}

function formatAiError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown AI API error";
  }
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const record = error as { status?: number; code?: number };
  if (typeof record.status === "number") return record.status;
  if (typeof record.code === "number") return record.code;
  return undefined;
}

export function isInsufficientCreditsError(error: unknown): boolean {
  const message = formatAiError(error).toLowerCase();
  const status = getErrorStatus(error);
  return (
    status === 402 ||
    message.includes("requires more credits") ||
    message.includes("insufficient credits") ||
    message.includes("payment required") ||
    message.includes("insufficient_quota")
  );
}

export function isNonRetryableProviderError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 401 || status === 402 || status === 403) return true;
  return isInsufficientCreditsError(error);
}

export function isRetryableAiError(error: unknown): boolean {
  if (isNonRetryableProviderError(error)) return false;

  const message = formatAiError(error).toLowerCase();
  const status = getErrorStatus(error);

  if (status === 429 || (typeof status === "number" && status >= 500)) {
    return true;
  }

  if (message.includes("timed out") || message.includes("timeout")) {
    return true;
  }

  if (
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("enotfound") ||
    message.includes("socket") ||
    message.includes("aborterror")
  ) {
    return true;
  }

  if (error instanceof TypeError && message.includes("fetch")) {
    return true;
  }

  if (message.includes("invalid json")) {
    return true;
  }

  if (
    message.includes("empty content") ||
    message.includes("empty response")
  ) {
    return true;
  }

  if (
    message.includes("rate limit") ||
    message.includes("rate_limit") ||
    message.includes("429")
  ) {
    return true;
  }

  if (
    message.includes("quota") ||
    message.includes("resource exhausted") ||
    message.includes("resource_exhausted")
  ) {
    return true;
  }

  if (
    /\b5\d{2}\b/.test(message) ||
    message.includes("internal server error") ||
    message.includes("bad gateway") ||
    message.includes("service unavailable") ||
    message.includes("gateway timeout")
  ) {
    return true;
  }

  return false;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} request timed out after ${ms}ms`));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  label: string,
  timeoutMs: number = AI_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`${label} request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonResponse(text: string, provider: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(`${provider} returned an empty response`);
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`${provider} returned invalid JSON`);
  }
}

function usesCompletionTokensParam(model: string): boolean {
  return /^gpt-5/i.test(model) || /^o\d/i.test(model);
}

function usesOpenAiResponsesApi(model: string): boolean {
  return /^gpt-5/i.test(model) || /^o\d/i.test(model);
}

function buildOpenAiChatBody(
  model: string,
  messages: Array<{ role: string; content: string }>,
  options?: {
    temperature?: number;
    maxOutputTokens?: number;
    json?: boolean;
  }
): Record<string, unknown> {
  const body: Record<string, unknown> = { model, messages };
  const isGpt5Family = usesCompletionTokensParam(model);

  if (options?.temperature !== undefined && !isGpt5Family) {
    body.temperature = options.temperature;
  }

  if (options?.json) {
    body.response_format = { type: "json_object" };
  }

  const maxTokens = options?.maxOutputTokens ?? DEFAULT_OPENAI_MAX_OUTPUT_TOKENS;
  if (isGpt5Family) {
    body.max_completion_tokens = maxTokens;
  } else {
    body.max_tokens = maxTokens;
  }

  return body;
}

function buildOpenAiResponsesBody(
  model: string,
  systemInstruction: string,
  prompt: string,
  options?: { maxOutputTokens?: number; json?: boolean }
): Record<string, unknown> {
  return {
    model,
    input: [
      { role: "developer", content: systemInstruction },
      { role: "user", content: prompt },
    ],
    reasoning: { effort: "low" },
    max_output_tokens: options?.maxOutputTokens ?? DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
    text: {
      format: { type: options?.json === false ? "text" : "json_object" },
    },
  };
}

async function parseOpenAiHttpResponse(
  response: Response,
  config: AiConfig,
  requestStarted: number,
  api: "chat" | "responses"
): Promise<unknown> {
  const requestId = response.headers.get("x-request-id");
  const durationMs = Date.now() - requestStarted;

  if (!response.ok) {
    const body = await response.text();
    console.error(
      `[AI] OpenAI request failed — api=${api} status=${response.status} model=${config.openAiModel}` +
        ` durationMs=${durationMs}` +
        (requestId ? ` requestId=${requestId}` : "") +
        ` body=${body.slice(0, 500)}`
    );
    const error = new Error(
      `OpenAI API error (${response.status}): ${body || response.statusText}`
    );
    (error as Error & { status?: number; requestId?: string | null }).status =
      response.status;
    (error as Error & { requestId?: string | null }).requestId = requestId;
    throw error;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  logOpenAiResponseInspection(payload, {
    model: config.openAiModel,
    durationMs,
    requestId,
    api,
  });

  const nestedError = asOpenAiError(payload.error);
  if (nestedError) {
    throw new Error(`OpenAI API error: ${nestedError}`);
  }

  const extraction = extractOpenAiText(payload);
  if (!extraction.text) {
    const reason = extraction.finishReason ?? "unknown";
    throw new Error(
      `OpenAI returned empty content (finishReason=${reason}, api=${api})`
    );
  }

  const result = parseJsonFromOpenAiText(extraction.text, "OpenAI");
  setActiveAiModel(config.openAiModel);

  const usage = asOpenAiUsage(payload.usage);
  console.log(
    `[AI] OpenAI response received api=${api} model=${config.openAiModel}` +
      ` durationMs=${durationMs}` +
      ` source=${extraction.source}` +
      (usage?.total_tokens != null ? ` tokens=${usage.total_tokens}` : "") +
      (requestId ? ` requestId=${requestId}` : "")
  );

  return result;
}

function asOpenAiError(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { message?: string };
  return typeof record.message === "string" ? record.message : null;
}

function asOpenAiUsage(value: unknown): {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
} | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    prompt_tokens:
      typeof record.prompt_tokens === "number"
        ? record.prompt_tokens
        : typeof record.input_tokens === "number"
          ? record.input_tokens
          : undefined,
    completion_tokens:
      typeof record.completion_tokens === "number"
        ? record.completion_tokens
        : typeof record.output_tokens === "number"
          ? record.output_tokens
          : undefined,
    total_tokens:
      typeof record.total_tokens === "number" ? record.total_tokens : undefined,
  };
}

async function callOpenAiJsonInternal(
  prompt: string,
  systemInstruction: string,
  config: AiConfig,
  options?: { maxOutputTokens?: number }
): Promise<unknown> {
  if (!config.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const requestStarted = Date.now();
  const maxOutputTokens = options?.maxOutputTokens ?? DEFAULT_OPENAI_MAX_OUTPUT_TOKENS;
  const useResponsesApi = usesOpenAiResponsesApi(config.openAiModel);

  console.log(`[AI] Selected provider: OpenAI`);
  console.log(`[AI] Model: ${config.openAiModel}`);
  console.log(
    `[AI] OpenAI request started api=${useResponsesApi ? "responses" : "chat"}` +
      ` maxOutputTokens=${maxOutputTokens}`
  );

  const response = await fetchWithTimeout(
    useResponsesApi ? OPENAI_RESPONSES_API_URL : OPENAI_CHAT_API_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        useResponsesApi
          ? buildOpenAiResponsesBody(config.openAiModel, systemInstruction, prompt, {
              maxOutputTokens,
              json: true,
            })
          : buildOpenAiChatBody(
              config.openAiModel,
              [
                { role: "system", content: systemInstruction },
                { role: "user", content: prompt },
              ],
              { json: true, maxOutputTokens }
            )
      ),
    },
    "OpenAI",
    useResponsesApi ? OPENAI_RESPONSES_TIMEOUT_MS : AI_TIMEOUT_MS
  );

  return parseOpenAiHttpResponse(
    response,
    config,
    requestStarted,
    useResponsesApi ? "responses" : "chat"
  );
}

/** OpenAI-only JSON call — no Gemini/OpenRouter fallback. */
export async function callOpenAiJson(
  prompt: string,
  systemInstruction: string,
  options?: { maxOutputTokens?: number }
): Promise<unknown> {
  const { assertWritePathAllowed } = await import("@/lib/readOnlyGuard");
  assertWritePathAllowed("aiProvider", "callOpenAiJson");

  if (isProviderBlocked("openai")) {
    throw new Error("OpenAI provider is temporarily blocked");
  }

  const config = getAiConfig();
  if (!config.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const result = await callOpenAiJsonInternal(
    prompt,
    systemInstruction,
    config,
    options
  );
  markProviderSuccess("openai");
  return result;
}

function buildOpenRouterHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
  const title = process.env.OPENROUTER_APP_TITLE?.trim();
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;

  return headers;
}

export function getCachedConnectionTestResult(): AiConnectionTestResult | null {
  return connectionTestResult;
}

async function callGeminiJsonInternal(
  prompt: string,
  systemInstruction: string,
  config: AiConfig
): Promise<unknown> {
  const client = getGeminiClient();

  const response = await withTimeout(
    client.models.generateContent({
      model: config.geminiModel,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
    AI_TIMEOUT_MS,
    "Gemini"
  );

  const text = response.text;
  const result = parseJsonResponse(text ?? "", "Gemini");
  setActiveAiModel(config.geminiModel);
  return result;
}

export async function callOpenRouterJson(
  prompt: string,
  systemInstruction: string,
  config?: AiConfig
): Promise<unknown> {
  const resolvedConfig = config ?? getAiConfig();
  if (!resolvedConfig.openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const response = await fetchWithTimeout(
    OPENROUTER_API_URL,
    {
      method: "POST",
      headers: buildOpenRouterHeaders(resolvedConfig.openRouterApiKey),
      body: JSON.stringify({
        model: resolvedConfig.openRouterModel,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt },
        ],
      }),
    },
    "OpenRouter"
  );

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(body || `OpenRouter API error (${response.status})`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const message = payload.choices?.[0]?.message?.content;
  const result = parseJsonResponse(message ?? "", "OpenRouter");
  setActiveAiModel(resolvedConfig.openRouterModel);
  return result;
}

export async function callAiJson(
  prompt: string,
  systemInstruction: string
): Promise<unknown> {
  const { assertWritePathAllowed } = await import("@/lib/readOnlyGuard");
  assertWritePathAllowed("aiProvider", "callAiJson");
  if (isAiGloballyBlocked()) {
    console.error(
      "[AI] Fallback activated — all providers blocked (insufficient credits)"
    );
    throw new Error("AI unavailable — provider blocked due to insufficient credits");
  }

  const config = getAiConfig();
  const errors: string[] = [];

  // OpenAI is always attempted first when a key exists and is not blocked.
  if (config.openAiApiKey && !isProviderBlocked("openai")) {
    try {
      const result = await retryWithBackoff(
        () => callOpenAiJsonInternal(prompt, systemInstruction, config),
        { maxAttempts: 2, baseDelayMs: 400, maxDelayMs: 2_000, retryable: isRetryableAiError }
      );
      markProviderSuccess("openai");
      return result;
    } catch (error) {
      const detail = formatAiError(error);
      const status = (error as Error & { status?: number }).status;
      const requestId = (error as Error & { requestId?: string }).requestId;
      console.error(
        `[AI] OpenAI failed — model=${config.openAiModel}` +
          (status != null ? ` status=${status}` : "") +
          (requestId ? ` requestId=${requestId}` : "") +
          ` error=${detail}`
      );
      errors.push(`OpenAI: ${detail}`);
      if (isInsufficientCreditsError(error)) {
        markProviderFailure("openai", detail, { insufficientCredits: true });
      } else if (isNonRetryableProviderError(error)) {
        markProviderFailure("openai", detail);
      }
      const canFallback =
        (config.geminiApiKey && !isProviderBlocked("gemini")) ||
        (config.openRouterApiKey && !isProviderBlocked("openrouter"));
      if (!canFallback) {
        throw error;
      }
      console.warn("[AI] Fallback activated — OpenAI failed, trying backup providers");
    }
  } else if (config.openAiApiKey && isProviderBlocked("openai")) {
    console.warn("[AI] OpenAI skipped — provider temporarily blocked");
  } else {
    console.warn(
      "[AI] OPENAI_API_KEY not present in process.env — skipping OpenAI (check .env and restart dev server)"
    );
  }

  if (config.geminiApiKey && !isProviderBlocked("gemini")) {
    console.log(`[AI] Selected provider: Gemini (model: ${config.geminiModel})`);
    console.log("[AI] Sending request...");
    try {
      const result = await retryWithBackoff(
        () => callGeminiJsonInternal(prompt, systemInstruction, config),
        { maxAttempts: 3, baseDelayMs: 800, maxDelayMs: 10_000, retryable: isRetryableAiError }
      );
      markProviderSuccess("gemini");
      console.log("[AI] Response received");
      return result;
    } catch (error) {
      const detail = formatAiError(error);
      console.error(`[AI] Gemini error: ${detail}`);
      errors.push(`Gemini: ${detail}`);
      markProviderFailure("gemini", detail, {
        insufficientCredits: isInsufficientCreditsError(error),
      });
      const canFallback =
        config.openRouterApiKey &&
        isRetryableAiError(error) &&
        !isProviderBlocked("openrouter");
      if (!canFallback) {
        throw error;
      }
      console.warn("[AI] Fallback activated — trying OpenRouter");
    }
  }

  if (config.openRouterApiKey && !isProviderBlocked("openrouter")) {
    console.log(
      `[AI] Selected provider: OpenRouter (model: ${config.openRouterModel})`
    );
    console.log("[AI] Sending request...");
    try {
      const result = await callOpenRouterJson(prompt, systemInstruction, config);
      markProviderSuccess("openrouter");
      console.log("[AI] Response received");
      return result;
    } catch (error) {
      const detail = formatAiError(error);
      console.error(`[AI] OpenRouter error: ${detail}`);
      errors.push(`OpenRouter: ${detail}`);
      if (isInsufficientCreditsError(error)) {
        markProviderFailure("openrouter", detail, {
          insufficientCredits: true,
          blockAll: !config.openAiApiKey && !config.geminiApiKey,
        });
        throw new Error("OpenRouter insufficient credits");
      }
      markProviderFailure("openrouter", detail);
      throw error;
    }
  }

  throw new Error(
    errors.length > 0
      ? `All AI providers failed: ${errors.join("; ")}`
      : isAiConfigured()
        ? "All configured AI providers are temporarily unavailable"
        : "No AI API keys configured (set OPENAI_API_KEY)"
  );
}

async function testGeminiConnection(
  config: AiConfig
): Promise<AiConnectionTestResult> {
  const client = getGeminiClient();
  const response = await withTimeout(
    client.models.generateContent({
      model: config.geminiModel,
      contents: "Reply with exactly: OK",
      config: {
        temperature: 0,
        maxOutputTokens: 16,
      },
    }),
    AI_TIMEOUT_MS,
    "Gemini"
  );

  const text = response.text?.trim();
  if (!text) {
    return { success: false, error: "Gemini returned an empty response" };
  }

  setActiveAiModel(config.geminiModel);
  return { success: true, response: text, provider: "gemini" };
}

async function testOpenRouterConnection(
  config: AiConfig
): Promise<AiConnectionTestResult> {
  const response = await fetchWithTimeout(
    OPENROUTER_API_URL,
    {
      method: "POST",
      headers: buildOpenRouterHeaders(config.openRouterApiKey!),
      body: JSON.stringify({
        model: config.openRouterModel,
        temperature: 0,
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
      }),
    },
    "OpenRouter"
  );

  if (!response.ok) {
    const body = await response.text();
    return {
      success: false,
      error: body || `OpenRouter API error (${response.status})`,
    };
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) {
    return { success: false, error: "OpenRouter returned an empty response" };
  }

  setActiveAiModel(config.openRouterModel);
  return { success: true, response: text, provider: "openrouter" };
}

async function testOpenAiConnection(
  config: AiConfig
): Promise<AiConnectionTestResult> {
  const useResponsesApi = usesOpenAiResponsesApi(config.openAiModel);
  const response = await fetchWithTimeout(
    useResponsesApi ? OPENAI_RESPONSES_API_URL : OPENAI_CHAT_API_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        useResponsesApi
          ? {
              model: config.openAiModel,
              input: [{ role: "user", content: "Reply with exactly: OK" }],
              reasoning: { effort: "low" },
              max_output_tokens: 256,
              text: { format: { type: "text" } },
            }
          : buildOpenAiChatBody(
              config.openAiModel,
              [{ role: "user", content: "Reply with exactly: OK" }],
              { maxOutputTokens: 256 }
            )
      ),
    },
    "OpenAI"
  );

  if (!response.ok) {
    const body = await response.text();
    return {
      success: false,
      error: body || `OpenAI API error (${response.status})`,
    };
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const text = extractOpenAiText(payload).text.trim();
  if (!text) {
    return {
      success: false,
      error: "OpenAI returned an empty response",
    };
  }

  setActiveAiModel(config.openAiModel);
  return { success: true, response: text, provider: "openai" };
}

export async function testAiConnection(): Promise<AiConnectionTestResult> {
  if (connectionTestResult) {
    return connectionTestResult;
  }
  if (connectionTestPromise) {
    return connectionTestPromise;
  }

  connectionTestPromise = (async () => {
    const config = getAiConfig();

    if (!isAiConfigured()) {
      connectionTestResult = {
        success: false,
        error: "No AI API keys configured (set OPENAI_API_KEY)",
      };
      return connectionTestResult;
    }

    if (config.openAiApiKey && !isProviderBlocked("openai")) {
      try {
        connectionTestResult = await testOpenAiConnection(config);
        if (connectionTestResult.success) {
          return connectionTestResult;
        }
      } catch (error) {
        if (!config.geminiApiKey && !config.openRouterApiKey) {
          connectionTestResult = {
            success: false,
            error: formatAiError(error),
          };
          return connectionTestResult;
        }
      }
    }

    if (config.geminiApiKey && !isProviderBlocked("gemini")) {
      try {
        connectionTestResult = await testGeminiConnection(config);
        if (connectionTestResult.success) {
          return connectionTestResult;
        }
      } catch (error) {
        if (!config.openRouterApiKey) {
          if (!connectionTestResult) {
            connectionTestResult = {
              success: false,
              error: formatAiError(error),
            };
          }
          return connectionTestResult;
        }
      }
    }

    if (config.openRouterApiKey && !isProviderBlocked("openrouter")) {
      connectionTestResult = await testOpenRouterConnection(config);
      if (
        !connectionTestResult.success &&
        connectionTestResult.error &&
        (connectionTestResult.error.includes("402") ||
          isInsufficientCreditsError(new Error(connectionTestResult.error)))
      ) {
        markProviderFailure("openrouter", connectionTestResult.error, {
          insufficientCredits: true,
          blockAll: !config.openAiApiKey && !config.geminiApiKey,
        });
      }
      return connectionTestResult;
    }

    connectionTestResult = {
      success: false,
      error: isAiConfigured()
        ? "All configured AI providers are temporarily unavailable"
        : "No AI API keys configured (set OPENAI_API_KEY)",
    };
    return connectionTestResult;
  })();

  try {
    return await connectionTestPromise;
  } finally {
    connectionTestPromise = null;
  }
}

export async function ensureAiConnection(): Promise<boolean> {
  const result = await testAiConnection();
  return result.success;
}
