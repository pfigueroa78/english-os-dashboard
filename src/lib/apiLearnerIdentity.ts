import { auth, currentUser } from "@clerk/nextjs/server";

const LOCAL_EMAIL_HEADER = "x-english-os-user-email";

type ClerkAuthResult = Awaited<ReturnType<typeof auth>>;

function isLocalDevelopment() {
  return process.env.NODE_ENV !== "production" || process.env.ENGLISH_OS_LOCAL_AUTH_BYPASS === "1";
}

function emailFromClaims(claims: unknown) {
  const sessionClaims = claims as Record<string, unknown> | null | undefined;
  return String(
    sessionClaims?.email ||
      sessionClaims?.primary_email_address ||
      sessionClaims?.primaryEmailAddress ||
      ""
  ).trim();
}

function localHeaderEmail(request: Request) {
  if (!isLocalDevelopment()) return "";
  return String(request.headers.get(LOCAL_EMAIL_HEADER) || "").trim();
}

async function authSafely() {
  try {
    return await auth();
  } catch (error) {
    if (isLocalDevelopment()) return null;
    throw error;
  }
}

async function currentUserEmailSafely() {
  try {
    const user = await currentUser();
    return String(user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || "").trim();
  } catch (error) {
    if (isLocalDevelopment()) return "";
    throw error;
  }
}

export async function getApiLearnerIdentity(request: Request) {
  const authResult = (await authSafely()) as ClerkAuthResult | null;
  const userId = authResult?.userId || "";
  const claimsEmail = emailFromClaims(authResult?.sessionClaims);
  const fallbackEmail = localHeaderEmail(request);

  if (!userId && !fallbackEmail) {
    return {
      authenticated: false,
      userId: "",
      email: "",
      source: "none" as const,
    };
  }

  const email = claimsEmail || fallbackEmail || (await currentUserEmailSafely());

  return {
    authenticated: Boolean(userId || fallbackEmail),
    userId,
    email,
    source: userId ? ("clerk" as const) : ("local-dev-header" as const),
  };
}

export function localLearnerEmailHeaderName() {
  return LOCAL_EMAIL_HEADER;
}
