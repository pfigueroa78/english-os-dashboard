
// Keep the public coach endpoint on the pedagogy-first implementation directly.
// Routing this through middleware is fragile because this project uses src/middleware.ts
// for Clerk authentication, so a second root middleware is not the active entry point.
export const maxDuration = 120;
export { coachPostSafe as POST } from "@/lib/coachRouteHandler";

