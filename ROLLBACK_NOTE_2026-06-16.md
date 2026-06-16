# Rollback decision — 2026-06-16

The v0.2 adaptive dashboard UI is still not the desired learning experience.

Decision: restore the pre-dashboard baseline from the morning, before `Implement English OS v0.2 adaptive learning dashboard`.

Rollback target: `7b8f94757da42a05875f7de0d8bc274f60ad46e5`.

This keeps the class-pack based pedagogical knowledge intact while removing the dashboard-first learning experience from production.

The dashboard and later QA UI experiments remain recoverable from Git history and backup branches.
