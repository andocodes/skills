---
name: review
description: Use when the user asks to review code, review a PR, inspect a diff or branch, audit recent changes, find bugs, assess code quality, or perform a strict/harsh/deep/thermonuclear review. Focus on concrete defects, regressions, security risks, correctness issues, missing tests, maintainability risks, and unclear contracts. Return severity-first findings grounded in source references. Do not use for general explanation, refactoring, or documentation unless the user explicitly asks for a review.
---

# Review

Review code like a senior maintainer protecting the system. Be direct, specific, and evidence-led. Findings come first; praise, change summaries, and style preferences are secondary.

## Workflow

1. Establish the review surface.
   - Start with `git status --short`, `git diff --stat`, and the relevant diff unless the user names files, commits, or a PR.
   - Read nearby code, tests, schemas, config, docs, and call sites before judging a change.
   - Identify the intended behavior, affected users, public contracts, data shape, and rollout risk.
   - Keep unrelated dirty work out of scope unless it affects the reviewed change.

2. Look for real defects.
   - Prioritize issues that could break behavior, corrupt data, weaken security, surprise users, or make future changes unsafe.
   - Treat tests, migrations, error paths, observability, and backwards compatibility as review targets, not afterthoughts.
   - Check whether names, boundaries, and abstractions make the code easier to reason about. Flag maintainability only when it creates concrete risk.
   - Avoid style nits, preference fights, and speculative rewrites unless the user asked for a broad quality pass.

3. Review by risk.
   - Correctness: invariants, null/empty states, ordering, idempotency, concurrency, retries, time, rounding, and boundary values.
   - Security: authorization, authentication, injection, secrets, data exposure, privilege escalation, auditability, and dependency trust.
   - Compatibility: existing data, APIs, file formats, old clients, saved state, migrations, and user workflows.
   - Operability: rollback, feature flags, logging, metrics, alerts, debugging, support burden, and partial failure.
   - Tests: missing coverage for changed behavior, edge cases, regressions, fixtures, and integration boundaries.
   - Maintainability: coupling, duplicated sources of truth, unclear ownership, hidden contracts, overbroad abstractions, and naming that obscures behavior.

4. Use strict mode when requested.
   - Trigger strict mode for words like `strict`, `hard`, `harsh`, `deep`, `audit`, `thermonuclear`, or `code quality`.
   - In strict mode, inspect architecture, test strategy, error handling, extensibility, and long-term ownership more aggressively.
   - Stay fair: do not manufacture findings. If the code is solid, say so and name the remaining risk surface.

5. Validate when useful.
   - Run focused tests, type checks, linters, schema checks, or reproduction commands when they materially increase confidence and are practical.
   - If validation is skipped, say why and what residual risk remains.
   - Do not edit code during a pure review unless the user asks for fixes.

## Finding Format

Use findings first. Order by severity, then confidence.

Severity:

- `P0`: data loss, security breach, outage, or release-blocking breakage.
- `P1`: likely user-visible bug, serious regression, migration risk, or unsafe behavior.
- `P2`: meaningful correctness, compatibility, operability, or maintainability risk.
- `P3`: minor issue worth fixing, but not blocking.

Each finding should include:

- Severity and concise title.
- File and line reference.
- What is wrong.
- Why it matters.
- Concrete fix direction.

Prefer this shape:

```markdown
Findings:
- `P1` <title> - <file:line>
  <what breaks and why it matters.>
  Fix: <specific direction.>
```

If there are no findings:

```markdown
Findings: None found.

Residual risk:
- <untested area, assumption, or "None material.">
```

## Response Shape

Use this shape unless the user asks for something else:

```markdown
Findings:
- `P1` <title> - <file:line>
  <issue, impact, fix direction.>

Open questions:
- <only if needed>

Validation:
- <commands run or not run>

Summary:
<one or two sentences about the reviewed surface.>
```

Keep summaries short and after findings. Do not lead with "looks good" when material issues exist.

## Guardrails

- Cite exact files and lines for code findings.
- Mark uncertainty plainly instead of overstating confidence.
- Do not bury serious issues among cosmetic notes.
- Do not repeat the diff back to the user.
- Do not praise as filler.
- Keep the tone direct, rigorous, and collaborative.
