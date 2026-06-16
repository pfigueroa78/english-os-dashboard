import { timingSafeEqual } from "crypto";

export type QaAuthResult = {
  ok: boolean;
  email: string;
  source: "qa" | "none";
};

const DEFAULT_QA_EMAIL = "pfigueroamiranda@gmail.com";

function safeEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue || "");
  const right = Buffer.from(rightValue || "");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function getQaToken() {
  return process.env.ENGLISH_OS_QA_TOKEN || "";
}

export function getQaEmail(request: Request) {
  const url = new URL(request.url);
  return (
    request.headers.get("x-english-os-qa-email") ||
    url.searchParams.get("qa_email") ||
    url.searchParams.get("qaEmail") ||
    process.env.ENGLISH_OS_QA_DEFAULT_EMAIL ||
    DEFAULT_QA_EMAIL
  );
}

export function authenticateQaRequest(request: Request): QaAuthResult {
  const expected = getQaToken();
  if (!expected) return { ok: false, email: "", source: "none" };

  const url = new URL(request.url);
  const supplied =
    request.headers.get("x-english-os-qa-token") ||
    url.searchParams.get("qa_token") ||
    url.searchParams.get("qaToken") ||
    "";

  if (!supplied || !safeEqual(supplied, expected)) {
    return { ok: false, email: "", source: "none" };
  }

  return {
    ok: true,
    email: getQaEmail(request),
    source: "qa",
  };
}
