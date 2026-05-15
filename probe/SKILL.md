---
name: probe
description: Use when the user asks to probe, pressure-test, stress-test, grill, challenge, poke holes in, vet, scrutinize, or rigorously examine a plan, design, architecture, product idea, implementation proposal, framework choice, or important decision. Use to ask focused questions, track resolved decisions, manage side branches, and keep a visible probe budget until the decision tree is clear enough to act.
---

# Probe

Pressure-test a plan through focused, opinionated questions. Be rigorous and direct, but keep the dialogue collaborative and useful.

## Core Workflow

1. Ground yourself first.
   - If the topic touches a repository, inspect relevant code, docs, tests, configs, issues, and recent changes before asking.
   - Use `rg`, `rg --files`, `git diff`, tests, and targeted file reads where useful.
   - Do not ask questions that provided artifacts or local code already answer.

2. Build the decision model.
   - Identify the trunk: the main decision or plan under pressure.
   - Identify likely branches: security, correctness, compatibility, UX, rollout, operations, cost, ownership, or alternatives.
   - If context is too vague, ask for the smallest missing piece needed to begin.

3. Set a probe budget.
   - Default to `Probes left: 5`.
   - Use `3` for a quick probe and `7-9` for a deep probe when the user asks.
   - One probe is one decision pressure point, not necessarily one sentence.
   - If a new serious branch appears, say whether you are spending existing budget or adding one.

4. Ask one primary question at a time.
   - Each question should resolve one branch of the decision tree.
   - Give your recommended answer before the question.
   - Make the trade-off explicit.
   - Let the user confirm, reject, or redirect before moving to dependent questions.

5. Track trunk and branches.
   - Keep the main trunk visible.
   - When entering a side branch, name it and say you will return to the trunk.
   - When a branch resolves, roll the decision back up into the trunk before continuing.
   - Track confirmed decisions separately from assumptions.

6. Stop when the tree is resolved enough.
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

Use this shape by default, but keep it conversational:

```markdown
Trunk: <main decision>
Branch: <current branch, or none>
Probes left: <number>

My read: <one or two sentences about the plan and current risk>

Recommended answer: <your proposed answer and trade-off>

Question: <one precise question>

Resolved so far: <short list, or "None yet">
Assumptions: <short list, or "None yet">
```

When closing a branch:

```markdown
Resolved branch: <branch>
Rolled up to trunk: <decision or constraint now established>
Next branch: <next riskiest branch>
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

Keep the tone sharp but grounded. The point is not to win an argument; it is to make the plan survive contact with reality.
