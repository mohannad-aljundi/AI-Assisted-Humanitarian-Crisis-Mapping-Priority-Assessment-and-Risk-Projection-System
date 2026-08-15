/**
 * Single entry point for AI provider resolution across the pipeline.
 * OpenAI is primary; Gemini and OpenRouter are fallbacks only.
 */
export {
  callAiJson,
  callOpenAiJson,
  ensureAiConnection,
  getActiveAiModel,
  getAiConfig,
  getAiKeyPresence,
  getAiProviderSummary,
  getAiProviderStatus,
  getAiFallbackUserMessage,
  isAiAvailable,
  isAiConfigured,
  logAiProviderStartup,
  testAiConnection,
  type AiConfig,
  type AiConnectionTestResult,
  type AiProviderName,
} from "@/lib/aiProvider";

export {
  isAiGloballyBlocked,
  isProviderBlocked,
} from "@/lib/aiProviderStatus";
