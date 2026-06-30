const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_COACH_MODEL = process.env.OPENAI_COACH_MODEL || "gpt-5.4-mini";
const OPENAI_COACH_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_COACH_MAX_OUTPUT_TOKENS || 8000);
const OPENAI_COACH_RETRY_MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_COACH_RETRY_MAX_OUTPUT_TOKENS || 12000);

export function coachModelName() {
  return OPENAI_COACH_MODEL;
}

export function getOutputText(openaiResponse: any): string {
  if (typeof openaiResponse?.output_text === "string") return openaiResponse.output_text.trim();
  const output = openaiResponse?.output;
  if (!Array.isArray(output)) return "";
  return output
    .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
    .map((content: any) => content?.text || "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function usage(openaiResponse: any) {
  const u = openaiResponse?.usage || {};
  return {
    inputTokens: Number(u.input_tokens ?? u.prompt_tokens ?? 0) || 0,
    outputTokens: Number(u.output_tokens ?? u.completion_tokens ?? 0) || 0,
    totalTokens: Number(u.total_tokens ?? 0) || 0,
  };
}

export function assertCompleteModelResponse(data: any, reply: string) {
  const reason = data?.incomplete_details?.reason || data?.incompleteDetails?.reason || "";
  if (data?.status === "incomplete" || reason === "max_output_tokens") {
    throw new Error("The coach response reached its output limit before the class was complete. Please retry the class request.");
  }
  if (!reply.trim()) throw new Error("The coach returned an empty response.");
}

export function modelResponseNeedsRetry(data: any, reply: string) {
  const reason = data?.incomplete_details?.reason || data?.incompleteDetails?.reason || "";
  return data?.status === "incomplete" || reason === "max_output_tokens" || !reply.trim();
}

export async function callCoachModel(input: any[], maxOutputTokens = OPENAI_COACH_MAX_OUTPUT_TOKENS) {
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: OPENAI_COACH_MODEL, input, max_output_tokens: maxOutputTokens }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "OpenAI request failed.");
  return data;
}

export async function callCompleteCoachModel(input: any[]) {
  let data = await callCoachModel(input);
  let reply = getOutputText(data);

  if (modelResponseNeedsRetry(data, reply)) {
    console.warn("[coach] incomplete model response; retrying", {
      status: data?.status || "unknown",
      reason: data?.incomplete_details?.reason || data?.incompleteDetails?.reason || "empty_output",
      outputTokens: usage(data).outputTokens,
      retryMaxOutputTokens: OPENAI_COACH_RETRY_MAX_OUTPUT_TOKENS,
    });
    data = await callCoachModel(input, OPENAI_COACH_RETRY_MAX_OUTPUT_TOKENS);
    reply = getOutputText(data);
  }

  assertCompleteModelResponse(data, reply);
  return { data, reply };
}
