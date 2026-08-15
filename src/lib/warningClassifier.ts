import type { WarningSeverity } from "@/types";

export interface ClassifiedWarning {
  message: string;
  severity: WarningSeverity;
  groupKey: string;
}

interface PatternRule {
  test: (text: string) => boolean;
  message: string;
  severity: WarningSeverity;
  groupKey: string;
}

const PATTERN_RULES: PatternRule[] = [
  {
    test: (t) =>
      /gdelt.*rate|rate.?limit.*gdelt|gdelt ratelimit/i.test(t) ||
      t.includes("please limit requests"),
    message: "🟡 GDELT rate limit — waiting before retrying automatically",
    severity: "warning",
    groupKey: "gdelt-rate-limit",
  },
  {
    test: (t) => t.includes("429") || /rate.?limit/i.test(t),
    message: "🟡 API rate limit reached — retrying with backoff",
    severity: "warning",
    groupKey: "api-rate-limit",
  },
  {
    test: (t) =>
      /timeout|timed out|aborterror|econnreset|fetch failed|network/i.test(t),
    message: "🟡 Network timeout — request will be retried automatically",
    severity: "warning",
    groupKey: "network-timeout",
  },
  {
    test: (t) =>
      /missing coord|no coordinates|invalid lat|invalid lng|latitude.*null|no valid coordinates|location could not|coordinates were missing/i.test(
        t
      ),
    message:
      "🟠 Report imported but map location could not be determined",
    severity: "warning",
    groupKey: "missing-coordinates",
  },
  {
    test: (t) => /location pending|unspecified location/i.test(t),
    message: "🟠 Location pending — map marker deferred until geocoded",
    severity: "warning",
    groupKey: "location-pending",
  },
  {
    test: (t) =>
      /foreign key|fk constraint|crisistimelineevent|report.*not found|timeline event/i.test(
        t
      ),
    message:
      "🟠 Timeline event could not be linked. Report was still processed",
    severity: "warning",
    groupKey: "timeline-fk",
  },
  {
    test: (t) =>
      /gemini.*switch|openrouter|ai fallback|all ai providers failed|ai provider unavailable|switching to openrouter|switching to fallback/i.test(
        t
      ),
    message: "🔴 AI provider unavailable — automatically switched to fallback provider",
    severity: "critical",
    groupKey: "ai-fallback",
  },
  {
    test: (t) => /openrouter|gemini/i.test(t) && /timeout/i.test(t),
    message: "🟡 AI provider timed out — retrying with fallback",
    severity: "warning",
    groupKey: "ai-timeout",
  },
  {
    test: (t) => /502|503|bad gateway|service unavailable/i.test(t),
    message: "🟡 Upstream service temporarily unavailable — retrying",
    severity: "warning",
    groupKey: "upstream-unavailable",
  },
  {
    test: (t) => /database|prisma|postgres|connection refused/i.test(t),
    message: "🔴 Database connection issue detected",
    severity: "critical",
    groupKey: "database-error",
  },
];

export function classifyWarning(raw: string): ClassifiedWarning | null {
  const lower = raw.toLowerCase();
  for (const rule of PATTERN_RULES) {
    if (rule.test(lower)) {
      return {
        message: rule.message,
        severity: rule.severity,
        groupKey: rule.groupKey,
      };
    }
  }
  return null;
}

export function stripStackTrace(text: string): string {
  const lines = text.split("\n");
  const humanLines = lines.filter(
    (line) =>
      !line.trim().startsWith("at ") &&
      !line.includes("node_modules") &&
      !/^Error:/.test(line.trim())
  );
  const joined = humanLines.join(" ").trim();
  return joined.length > 0 ? joined.slice(0, 280) : text.slice(0, 280);
}
