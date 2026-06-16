export type QaSession = {
  active: boolean;
  token: string;
  email: string;
};

const QA_TOKEN_KEY = "english-os-qa-token";
const QA_EMAIL_KEY = "english-os-qa-email";
const DEFAULT_QA_EMAIL = "pfigueroamiranda@gmail.com";

function isBrowser() {
  return typeof window !== "undefined";
}

export function readQaSession(): QaSession {
  if (!isBrowser()) {
    return { active: false, token: "", email: DEFAULT_QA_EMAIL };
  }

  const params = new URLSearchParams(window.location.search);
  const tokenFromUrl = params.get("qa_token") || params.get("qaToken") || "";
  const emailFromUrl = params.get("qa_email") || params.get("qaEmail") || "";

  if (tokenFromUrl) window.localStorage.setItem(QA_TOKEN_KEY, tokenFromUrl);
  if (emailFromUrl) window.localStorage.setItem(QA_EMAIL_KEY, emailFromUrl);

  const token = tokenFromUrl || window.localStorage.getItem(QA_TOKEN_KEY) || "";
  const email = emailFromUrl || window.localStorage.getItem(QA_EMAIL_KEY) || DEFAULT_QA_EMAIL;

  return {
    active: Boolean(token),
    token,
    email,
  };
}

export function getQaFetchHeaders(session: QaSession): Record<string, string> {
  if (!session.active || !session.token) return {};

  return {
    "x-english-os-qa-token": session.token,
    "x-english-os-qa-email": session.email,
  };
}

export function clearQaSession() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(QA_TOKEN_KEY);
  window.localStorage.removeItem(QA_EMAIL_KEY);
}
