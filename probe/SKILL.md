---
name: probe
description: Use when the user asks to probe, pressure-test, stress-test, grill, challenge, poke holes in, vet, scrutinize, or rigorously examine a plan, design, architecture, product idea, implementation proposal, framework choice, or important decision. Use to interview the user with focused questions, recommended answers, adaptive probe budgets, resolved decisions, assumptions, and branch tracking until the plan is clear enough to trust or revise.
---

# Probe

Interview the user hard, but usefully, until the plan is clear enough to trust or revise. Be rigorous, direct, and collaborative. Do not be theatrical.

## Workflow

1. Ground first.
   - If the topic touches a repository, inspect relevant code, docs, tests, configs, issues, and recent changes before asking.
   - Use `rg`, `rg --files`, `git diff`, tests, and targeted file reads where useful.
   - Use subagents only when the current environment permits them and the user has explicitly authorized delegated or parallel agent work.
   - Do not ask questions that provided artifacts or local code already answer.

2. Build a compact model of the plan.
   - Identify the goal, affected users, affected systems, proposed mechanism, success criteria, constraints, and stakes.
   - Identify the trunk: the main decision or plan under pressure.
   - Identify likely branches: correctness, security, compatibility, edge cases, operations, UX, maintenance, ownership, alternatives, or rollout.
   - If context is too vague, ask for the smallest missing piece needed to begin.
   - If there is enough context, proceed directly to the first high-risk question.

3. Estimate an adaptive probe budget.
   - Choose the budget from scope, stakes, uncertainty, and how much context the user already gave.
   - Use `2-4` probes for a quick check, `5-8` for most plans, `10-15` for broad architecture, migrations, security-sensitive work, or high-cost decisions.
   - Go beyond `15` only when the user asks for an extended interview. Split long interviews into rounds and checkpoint before continuing.
   - Do not spend a probe on basic intake when the prompt is too vague; ask the smallest setup question first.
   - Finish early when the tree is resolved. If a new serious branch appears, say whether you are expanding the budget or replacing a lower-risk branch.

4. Ask one primary question at a time.
   - Each question should resolve one branch of the decision tree.
   - Do not shotgun multiple questions.
   - Put the question before your recommended answer.
   - Make the trade-off explicit.
   - Let the user confirm, reject, or redirect before moving to dependent questions.

5. Track trunk and branches.
   - Keep trunk, current branch, and probes remaining visible, but do not lead with them unless the conversation needs the extra structure.
   - When entering a side branch, name it lightly and return to the trunk after it resolves.
   - When a branch resolves, say what it settles and what it means for the main plan.
   - Track confirmed decisions separately from assumptions.
   - When a user answer resolves multiple branches, say so and move to the next riskiest unresolved branch.

6. Close when the tree is resolved enough.
   - Summarize the agreed plan, confirmed decisions, assumptions, unresolved risks, and next move.
   - If the plan is weak, say so plainly and name the highest-leverage change.

## Probe Priority

Work from plan-breaking risks toward refinements:

1. Correctness: invariants, race conditions, data integrity, ordering, idempotency, constraints.
2. Security: authorization, authentication, injection, data exposure, privilege escalation, secrets.
3. Compatibility: existing data, APIs, migrations, old clients, saved state, user workflows.
4. Edge cases: empty states, concurrent users, retries, partial failure, boundary values, time zones.
5. Operability: rollback, observability, alerting, debugging, feature flags, support burden.
6. UX and product fit: confusing states, missing feedback, dead ends, broken expectations.
7. Maintenance: coupling, extensibility, naming, ownership, testability, migration paths.

## Response Shape

Use this shape by default, but keep it conversational and lighter when the exchange is simple:

```markdown
My read: <one or two sentences about the plan and current risk>

Questions: <one primary question; use multiple only when explicitly mapping a round>

Recommended answers: <your proposed answer and trade-off>

Progress: <probe budget or probes left; trunk and current branch if useful>
Resolved so far: <short list, or "None yet">
Assumptions: <short list, or "None yet">
```

When closing a branch:

```markdown
That settles <branch>: <decision or constraint>.
For the main plan, that means <effect on the trunk>.
Next riskiest branch: <branch>.
```

When ending:

```markdown
Decision: <agreed direction>

Resolved:
- <decision>

Still risky:
- <risk or "(none material)">

Next move:
- <action>
```

## Composition

- Use `illustrate`-style examples, option cards, or small diagrams when a branch is abstract or the user is comparing options.
- Return to probing after the illustration. Do not let examples replace the pressure-test.
- Use `clarify` only after probing when the user wants the resulting plan or code simplified.
