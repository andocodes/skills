---
name: illustrate
description: Use when the user asks to illustrate, make concrete, explain by example, compare options, show directions, visualize a concept, map a trade-off, or help them understand an idea just introduced in conversation. Especially useful during planning, architecture discussion, Grill Me sessions, decision-making, framework choices, product trade-offs, and abstract technical explanations. Use sense checks only when the user explicitly asks for checkpoints, tick-offs, a walkthrough, teaching mode, or similar.
---

# Illustrate

Make an abstract concept, option set, trade-off, or decision branch concrete enough for the user to reason about. Prefer concise examples, contrasts, and dialogue over long exposition.

## Core Workflow

1. Identify what needs to become concrete.
   - Restate the concept or decision in one short sentence when useful.
   - If the context is missing, ask for the smallest missing detail.
   - If the user asks during another skill workflow, preserve that workflow's goal and use `illustrate` as a supporting move.

2. Choose the lightest useful form.
   - Use option cards when comparing paths.
   - Use tiny scenarios when an abstract idea needs a real-world shape.
   - Use contrast tables when trade-offs across options matter.
   - Use Mermaid or ASCII sketches when relationships, flows, states, or dependencies matter.
   - Use analogies sparingly, and only when they clarify rather than decorate.

3. Show each direction critically.
   - For each option, include what it looks like in practice, why it may fit, where it hurts, and what would make it the wrong choice.
   - Keep examples specific to the user's scenario. Avoid generic textbook examples.
   - Do not pretend options are equal when one is clearly stronger; say which direction you lean and why.

4. Keep the dialogue open.
   - End with a useful next conversational move: a sharper question, a suggested decision criterion, or the next concept to illustrate.
   - Do not overload the user with every possible branch. Show enough to make the shape clear.

## Sense Checks

Use sense checks only when the user explicitly asks for checkpoints, tick-offs, a walkthrough, teaching mode, or similar.

When active:

- Break the explanation into small chunks.
- After each chunk or at the end, ask a lightweight check such as "Can we tick off why option A is attractive?" or "Which part still feels fuzzy: lifecycle, cost, or operational risk?"
- Do not quiz the user or make the interaction feel remedial.
- Treat the user's answer as a signal for what to clarify next.

## Visual Escalation

Default to chat-native formats: examples, option cards, tables, Mermaid, and ASCII sketches.

Create richer visual artifacts, generated images, slide-style outputs, frontend prototypes, or MCP App-style interactive views only when the user explicitly asks and the current harness supports the needed tools. If support is unclear, offer the chat-native version first and name the richer option as an escalation.

## Output Patterns

Use one of these shapes when it fits:

```markdown
The shape: <one sentence>

Option A: <name>
- Looks like: <concrete example>
- Good when: <fit>
- Hurts when: <failure mode>

Option B: <name>
- Looks like: <concrete example>
- Good when: <fit>
- Hurts when: <failure mode>

My lean: <short recommendation and why>
Next thing to decide: <question or criterion>
```

```markdown
Tiny example:
<small scenario, snippet, or sequence>

Why it matters:
- <insight>
- <trade-off>
```

## Guardrails

- Stay concise and concrete.
- Prefer three strong examples over ten shallow ones.
- Preserve uncertainty where the scenario is under-specified.
- Do not derail an active Grill Me session; illustrate the concept, then return to the riskiest unresolved branch.
