/**
 * Extract assistant text / JSON from OpenAI Chat Completions and Responses API payloads.
 */

export interface OpenAiTextExtraction {
  text: string;
  source: string;
  finishReason: string | null;
  outputTypes: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pushText(parts: string[], value: unknown): void {
  if (typeof value === "string" && value.trim()) {
    parts.push(value);
  }
}

function extractFromContentParts(content: unknown, parts: string[]): void {
  if (typeof content === "string") {
    pushText(parts, content);
    return;
  }
  if (!Array.isArray(content)) return;

  for (const item of content) {
    const block = asRecord(item);
    if (!block) continue;

    pushText(parts, block.text);
    pushText(parts, block.output_text);

    if (block.type === "output_json" && block.json != null) {
      try {
        parts.push(JSON.stringify(block.json));
      } catch {
        // ignore
      }
    }

    if (block.type === "json" && block.json != null) {
      try {
        parts.push(JSON.stringify(block.json));
      } catch {
        // ignore
      }
    }
  }
}

function extractFromOutputArray(output: unknown, parts: string[], outputTypes: string[]): void {
  if (!Array.isArray(output)) return;

  for (const item of output) {
    const block = asRecord(item);
    if (!block) continue;

    const type = typeof block.type === "string" ? block.type : "unknown";
    outputTypes.push(type);

    if (type === "message" || type === "output_message") {
      extractFromContentParts(block.content, parts);
      continue;
    }

    if (type === "function_call" || type === "tool_call") {
      pushText(parts, block.arguments);
      continue;
    }

    pushText(parts, block.text);
    extractFromContentParts(block.content, parts);
  }
}

export function extractOpenAiText(payload: unknown): OpenAiTextExtraction {
  const parts: string[] = [];
  const outputTypes: string[] = [];
  let finishReason: string | null = null;
  let source = "none";

  const root = asRecord(payload);
  if (!root) {
    return { text: "", source, finishReason, outputTypes };
  }

  pushText(parts, root.output_text);
  if (parts.length > 0) source = "output_text";

  extractFromOutputArray(root.output, parts, outputTypes);
  if (parts.length > 0 && source === "none") source = "output[]";

  const choices = root.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const choice = asRecord(choices[0]);
    if (choice) {
      finishReason =
        typeof choice.finish_reason === "string" ? choice.finish_reason : finishReason;

      const message = asRecord(choice.message);
      if (message) {
        const before = parts.length;
        extractFromContentParts(message.content, parts);
        if (parts.length > before) source = "choices[0].message.content";

        if (parts.length === before && message.parsed != null) {
          try {
            parts.push(JSON.stringify(message.parsed));
            source = "choices[0].message.parsed";
          } catch {
            // ignore
          }
        }
      }

      const text = choice.text;
      if (typeof text === "string" && text.trim()) {
        parts.push(text);
        source = "choices[0].text";
      }
    }
  }

  if (typeof root.status === "string") {
    finishReason = finishReason ?? root.status;
  }

  return {
    text: parts.join("\n").trim(),
    source,
    finishReason,
    outputTypes: [...new Set(outputTypes)],
  };
}

export function stripMarkdownJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  if (fenced?.[1]) return fenced[1].trim();

  const inline = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (inline?.[1]) return inline[1].trim();

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

export function parseJsonFromOpenAiText(text: string, provider: string): unknown {
  const normalized = stripMarkdownJsonFence(text);
  if (!normalized) {
    throw new Error(`${provider} returned an empty response`);
  }

  try {
    return JSON.parse(normalized);
  } catch {
    throw new Error(`${provider} returned invalid JSON`);
  }
}

export function describeOpenAiPayloadShape(payload: unknown): Record<string, unknown> {
  const root = asRecord(payload);
  if (!root) return { rootType: typeof payload };

  const extraction = extractOpenAiText(payload);
  const usage = asRecord(root.usage);

  return {
    id: typeof root.id === "string" ? root.id : null,
    object: typeof root.object === "string" ? root.object : null,
    status: typeof root.status === "string" ? root.status : null,
    finishReason: extraction.finishReason,
    outputTypes: extraction.outputTypes,
    choiceCount: Array.isArray(root.choices) ? root.choices.length : 0,
    outputCount: Array.isArray(root.output) ? root.output.length : 0,
    hasOutputText: typeof root.output_text === "string" && root.output_text.length > 0,
    extractedTextPresent: extraction.text.length > 0,
    extractedTextSource: extraction.source,
    extractedTextPreview: extraction.text
      ? extraction.text.slice(0, 300)
      : null,
    usage: usage
      ? {
          input_tokens: usage.input_tokens ?? usage.prompt_tokens ?? null,
          output_tokens: usage.output_tokens ?? usage.completion_tokens ?? null,
          total_tokens: usage.total_tokens ?? null,
        }
      : null,
  };
}

export function logOpenAiResponseInspection(
  payload: unknown,
  meta: { model: string; durationMs: number; requestId?: string | null; api: string }
): void {
  const shape = describeOpenAiPayloadShape(payload);
  console.info(
    `[AI] OpenAI raw response inspection api=${meta.api} model=${meta.model}` +
      ` durationMs=${meta.durationMs}` +
      (meta.requestId ? ` requestId=${meta.requestId}` : "") +
      ` id=${shape.id ?? "n/a"}` +
      ` object=${shape.object ?? "n/a"}` +
      ` finishReason=${shape.finishReason ?? "n/a"}` +
      ` outputTypes=${JSON.stringify(shape.outputTypes ?? [])}` +
      ` textPresent=${shape.extractedTextPresent}` +
      ` textSource=${shape.extractedTextSource}` +
      (shape.usage ? ` usage=${JSON.stringify(shape.usage)}` : "")
  );
  if (shape.extractedTextPreview) {
    console.info(
      `[AI] OpenAI extracted text preview: ${String(shape.extractedTextPreview).slice(0, 300)}`
    );
  }
}
