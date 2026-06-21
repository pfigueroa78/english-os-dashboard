export type PromptVariables = Record<string, string | number | boolean | null | undefined>;

export function renderPromptTemplate(template: string, variables: PromptVariables) {
  return String(template || "")
    .replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => String(variables[key] ?? ""))
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function assertPromptVariables(template: string, variables: PromptVariables) {
  const missing = Array.from(String(template || "").matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g))
    .map((match) => match[1])
    .filter((key) => variables[key] === undefined || variables[key] === null);
  if (missing.length) {
    throw new Error(`Missing prompt variables: ${Array.from(new Set(missing)).join(", ")}`);
  }
}
