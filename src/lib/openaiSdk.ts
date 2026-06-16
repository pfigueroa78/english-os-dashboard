import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return client;
}

export function getResponseOutputText(openaiResponse: any): string {
  if (typeof openaiResponse?.output_text === "string") {
    return openaiResponse.output_text;
  }

  const output = openaiResponse?.output;

  if (Array.isArray(output)) {
    const parts: string[] = [];

    for (const item of output) {
      if (Array.isArray(item?.content)) {
        for (const content of item.content) {
          if (typeof content?.text === "string") {
            parts.push(content.text);
          }
        }
      }
    }

    return parts.join("\n").trim();
  }

  return "";
}

export function getResponseTokenUsage(openaiResponse: any) {
  const usage = openaiResponse?.usage || {};

  const inputTokens =
    Number(
      usage.input_tokens ??
        usage.prompt_tokens ??
        usage.inputTokens ??
        0
    ) || 0;

  const outputTokens =
    Number(
      usage.output_tokens ??
        usage.completion_tokens ??
        usage.outputTokens ??
        0
    ) || 0;

  const totalTokens =
    Number(
      usage.total_tokens ??
        usage.totalTokens ??
        inputTokens + outputTokens
    ) || inputTokens + outputTokens;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}
