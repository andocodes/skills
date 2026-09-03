---
name: illustrate
description: Use when the user explicitly asks to illustrate, show, visualize, diagram, make concrete, compare directions, or explain by example. Turn the current discussion into the smallest useful visual, structural sketch, scenario, or option comparison while preserving any active planning, probing, review, or decision workflow. Use sense checks only when explicitly requested.
---

# Illustrate

Make the current point visible or concrete enough to reason about. Skip the preamble, keep prose brief, and choose the smallest view that exposes the important shape.

## Choose the Mode

- **Show the shape** when the user needs to understand structure, flow, ownership, state, sequence, or a proposed change.
- **Compare directions** when the user needs to see how options behave in practice and where each one fails.
- Use both only when the visual structure materially explains the trade-off.
- When invoked during another skill workflow, support that workflow and then return to its unresolved question.

## Visual Grammar

Match the format to the point:

- Logic or an algorithm: compact pseudocode.
- Runtime control flow: a call tree.
- Interaction, sequence, or data flow: Mermaid.
- UI or module composition: a component tree, annotated with only the files, state, props, and ownership boundaries that matter.
- File responsibility or a broad refactor: a shallow file tree.
- A change to an existing shape: a structural `diff`.
- An abstract idea: a tiny scenario or a precise analogy.
- A decision: option cards or a contrast table.

For example, show runtime nesting directly:

```text
submitRequest
  validateInput
  createRun
    persistPrompt
    startWorker
  streamEvents
```

Show component ownership when it affects the explanation:

```tsx
<RunPage> (apps/web/routes/run.tsx)
  useRunEvents()
  <RunToolbar>
    <CancelButton /> (packages/ui)
  <RunTimeline />
```

Show responsibilities without dumping the repository:

```text
src/
├── commands/       # interprets user actions
├── runs/           # owns run state
└── transport/      # moves events across the boundary
```

Include only the calls, files, states, relationships, and boundaries needed for the user's current question.

## Show Changes as Changes

Use `diff` when the point is what changes and the surrounding shape is already understood. Match the diff to the subject: component tree, file tree, call tree, state transition, or pseudocode.

```diff
 saveDocument
-  writeContent
+  compareWithStoredVersion
+  if unchanged: return cachedResult
+  writeContent
+  invalidateCache
```

Show the complete target block instead when most of it is new, omitted context would hide ownership or order, or the user needs a copyable result.

## Compare Directions Critically

For each meaningful option, show:

- what it looks like in the user's scenario;
- where it fits;
- its operational or conceptual cost;
- the condition that should rule it out.

Do not pretend options are equal when one is stronger. State a lean and the deciding reason. Prefer one concrete scenario per option over a long list of abstract pros and cons.

## Explain Beside the Visual

Place each short explanation next to the visual it supports. Use real names, paths, labels, and data when known. Preserve uncertainty rather than inventing missing architecture or product details.

Usually produce one strong view. Combine formats only when each answers a distinct part of the question, such as a file tree for ownership followed by a sequence diagram for runtime behavior.

End with a next question or decision criterion only when it moves the conversation forward; a self-contained visual does not need a conversational tail.

## Rich Visual Escalation

Default to chat-native pseudocode, trees, diffs, tables, Mermaid, and small scenarios.

When the user has asked to see or visualize something and a dense UI, layout, state comparison, or system concept would be materially clearer outside chat, create one focused HTML artifact if the current environment supports it. Use real labels and data, make it work at desktop and mobile sizes, follow an existing product's visual language when references are available, and open or present the artifact with the available preview tool.

Do not create a rich artifact when a small inline visual answers the question.

## Sense Checks

Use sense checks only when the user explicitly asks for checkpoints, tick-offs, a walkthrough, teaching mode, or similar. Explain in small chunks and ask lightweight checks that identify what remains unclear. Keep the interaction collaborative rather than remedial.

## Guardrails

- Be visual and concrete, not decorative.
- Prefer a shallow, legible view over exhaustive completeness.
- Use analogies only when their limits do not distort the concept.
- Do not derail an active probe or pressure-test session; illustrate the point and return to the riskiest unresolved branch.
