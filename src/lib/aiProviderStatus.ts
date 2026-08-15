import { getCached, setCached } from "@/lib/simpleCache";

const PROVIDER_FAILURE_TTL_MS = 5 * 60 * 1000;
const GLOBAL_AI_BLOCK_KEY = "ai:block:all";

export type ProviderHealth = "ok" | "failed" | "insufficient_credits" | "not_configured";
export type AiProviderId = "openai" | "gemini" | "openrouter";

export interface AiProviderStatusSnapshot {
  openai: ProviderHealth;
  gemini: ProviderHealth;
  openrouter: ProviderHealth;
  aiUnavailable: boolean;
  userMessage: string | null;
}

const USER_FALLBACK_MESSAGE =
  "AI provider unavailable or out of credits. Rule-based fallback used.";

let lastSnapshot: AiProviderStatusSnapshot = {
  openai: "not_configured",
  gemini: "not_configured",
  openrouter: "not_configured",
  aiUnavailable: false,
  userMessage: null,
};

const loggedMessages = new Set<string>();

function blockKey(provider: AiProviderId | "all"): string {
  return `ai:block:${provider}`;
}

export function isProviderBlocked(provider: AiProviderId): boolean {
  if (getCached<boolean>(GLOBAL_AI_BLOCK_KEY)) return true;
  return getCached<boolean>(blockKey(provider)) === true;
}

export function isAiGloballyBlocked(): boolean {
  return getCached<boolean>(GLOBAL_AI_BLOCK_KEY) === true;
}

export function markProviderFailure(
  provider: AiProviderId,
  reason: string,
  options?: { insufficientCredits?: boolean; blockAll?: boolean }
): void {
  const insufficientCredits = options?.insufficientCredits === true;
  const health: ProviderHealth = insufficientCredits ? "insufficient_credits" : "failed";

  lastSnapshot = {
    ...lastSnapshot,
    [provider]: health,
    aiUnavailable: insufficientCredits || options?.blockAll === true ? true : lastSnapshot.aiUnavailable,
    userMessage: insufficientCredits ? USER_FALLBACK_MESSAGE : lastSnapshot.userMessage,
  };

  setCached(blockKey(provider), true, PROVIDER_FAILURE_TTL_MS);

  if (options?.blockAll) {
    setCached(GLOBAL_AI_BLOCK_KEY, true, PROVIDER_FAILURE_TTL_MS);
    lastSnapshot = {
      ...lastSnapshot,
      aiUnavailable: true,
      userMessage: USER_FALLBACK_MESSAGE,
    };
  }

  logProviderIssueOnce(provider, reason);
}

export function markProviderSuccess(provider: AiProviderId): void {
  lastSnapshot = { ...lastSnapshot, [provider]: "ok" };
}

export function getAiProviderStatus(): AiProviderStatusSnapshot {
  return lastSnapshot;
}

export function getAiFallbackUserMessage(): string | null {
  return lastSnapshot.userMessage;
}

function logProviderIssueOnce(provider: string, reason: string): void {
  const key = `${provider}:${reason.slice(0, 120)}`;
  if (loggedMessages.has(key)) return;
  loggedMessages.add(key);
  console.warn(`[AI] ${provider} unavailable: ${reason}`);
}

export function resetAiProviderStatusForTests(): void {
  lastSnapshot = {
    openai: "not_configured",
    gemini: "not_configured",
    openrouter: "not_configured",
    aiUnavailable: false,
    userMessage: null,
  };
  loggedMessages.clear();
}
