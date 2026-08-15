import {
  getAiConfig,
  getAiProviderSummary,
  isAiConfigured,
  logAiProviderStartup,
  testAiConnection,
} from "@/lib/aiResolver";
import { markProviderFailure } from "@/lib/aiProviderStatus";

export async function validateAiOnStartup(): Promise<void> {
  logAiProviderStartup();

  if (!isAiConfigured()) {
    return;
  }

  const config = getAiConfig();
  const summary = getAiProviderSummary();
  const result = await testAiConnection();

  if (result.success) {
    const via =
      result.provider === "openai"
        ? `OpenAI (${config.openAiModel})`
        : result.provider === "gemini"
          ? `Gemini (${config.geminiModel}) [fallback — primary is ${summary.activeProvider}]`
          : `OpenRouter (${config.openRouterModel}) [fallback — primary is ${summary.activeProvider}]`;
    console.log(`[AI] Connection test succeeded via ${via}`);
    return;
  }

  const errorText = result.error ?? "Unknown error";
  if (
    errorText.includes("402") ||
    errorText.toLowerCase().includes("requires more credits") ||
    errorText.toLowerCase().includes("insufficient credits")
  ) {
    markProviderFailure("openrouter", errorText, { insufficientCredits: true });
    console.warn(
      "[AI] OpenRouter has insufficient credits — OpenAI primary will be used when available."
    );
    return;
  }

  console.error(`[AI] Connection test failed: ${errorText}`);
}
