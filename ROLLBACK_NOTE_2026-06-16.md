# Rollback decision — 2026-06-16

The unified dashboard UI experiment degraded the learning experience.

Decision: restore the morning baseline that preserved the class-pack based content structure and the prior pedagogical flow.

Rollback target: `3faa1b87ee47a7ade49b760b9f5e416552877e68`.

The later commits remain recoverable from Git history and from the backup branch created before resetting main.
