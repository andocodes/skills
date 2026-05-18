---
name: distill
description: Use when the user asks to distill, condense, summarize, brief, write up, document, or turn messy context into concise reader-ready material. Apply to discussions, notes, plans, decisions, codebases, READMEs, docs pages, architecture notes, API or CLI references, runbooks, contribution guides, executive summaries, and source comments or docstrings when requested. Focus on verified, concise, present-tense output for developers, users, maintainers, or executives. Do not use for general DOCX/PDF/file-format editing unless the task is about the content itself.
---

# Distill

Turn messy context into concise, verified, reader-ready material. Explain what matters now and how to act. Do not narrate the work that produced it.

## Workflow

1. Define reader and output.
   - Default to a concise, practical write-up for the audience implied by the request.
   - Use explicit reader modes when requested: `developer`, `user`, `maintainer`, or `executive`.
   - Choose the smallest useful artifact: summary, brief, decision record, README section, full README, docs page, reference, runbook, source comment, or docstring.
   - Ask only when audience or scope would materially change the output.

2. Ground in source artifacts.
   - Inspect source material before writing: conversation context, notes, existing README/docs, package metadata, CLI help, config schemas, tests, examples, public APIs, source comments, and recent diffs when relevant.
   - Write verified claims only. Omit uncertain claims, label them as assumptions, or ask for confirmation.
   - Prefer the user's terminology and project commands, options, and examples.
   - Do not assume the reader's OS, shell, harness, home directory layout, package manager, or installed tools unless the project requires them.
   - Preserve accurate existing material instead of rewriting for novelty.

3. Choose the structure.
   - Match structure to the requested output. Do not default to documentation sections when the user asked for a brief, summary, or decision record.
   - For repository docs, prefer README first. Treat the README as the front door: what it is, who it is for, quick start, core concepts, common workflows, and links.
   - Ask before creating or reorganizing a `docs/` folder.
   - When a `docs/` folder is approved or already established, use `docs/README.md` as the index and split stable deeper material into focused pages such as architecture, CLI reference, deployment, adapters, auth, operations, or contributing.
   - Include repository layout, architecture maps, file trees, and docs indexes only when the user asks for them or they explain a non-obvious navigation path, ownership boundary, generated area, or extension point.
   - Avoid scaffolding extra pages for small projects.

4. Write minimum sufficient material.
   - Use the shortest output that lets the target reader understand or act correctly.
   - Prefer present tense, active voice, concrete commands, examples, and direct section headings.
   - Mark environment-specific commands as examples or provide alternatives when paths, shells, or tools vary across platforms.
   - Put the happy path before internals. Link or defer deeper details when they are not needed for first use.
   - Cut filler, marketing language, apologies, and meta-commentary.

5. Keep history out unless requested.
   - Do not write implementation diary language such as "we added", "we removed", "now supports", "this used to", "legacy", or "during this refactor".
   - Use historical context only for changelogs, migration notes, deprecations, or explicit rationale docs.
   - Describe current behavior and current constraints plainly.

6. Handle source comments deliberately.
   - Edit inline comments and docstrings only when the user asks for them or points at source files.
   - Use comments/docstrings for public contracts, non-obvious constraints, examples, and why something must work a certain way.
   - Remove or avoid comments that restate obvious code.

## Reader Modes

- `developer`: setup, quick start, concepts, workflows, extension points, tests, and troubleshooting.
- `user`: what it does, common tasks, examples, configuration, and expected outcomes.
- `maintainer`: architecture, invariants, operations, releases, debugging, and ownership boundaries.
- `executive`: purpose, value, current capability, limits, risks, and next decisions.

## Output Patterns

Use one of these shapes when it fits:

```markdown
## Distilled Read

<One concise paragraph.>

- What matters: <core point>
- Why: <main reason>
- Trade-off: <material cost, limit, or risk>
- Next: <next useful action>
```

```markdown
## Decision Brief

<One concise paragraph.>

- Context: <what is being decided>
- Recommendation: <current direction>
- Options: <viable choices, if useful>
- Risks: <material uncertainty or cost>
- Next: <next useful action>
```

```markdown
# <Project>

<One-sentence purpose.>

## Quick Start
<Install and run the smallest verified path.>

## Core Concepts
<The few concepts needed to use or extend it.>

## Common Workflows
<Concrete tasks with commands or examples.>

## Reference
<Links to deeper docs, if they exist.>
```

```markdown
## Executive Summary

<One concise paragraph.>

- Capability: <what it does now>
- Fit: <where it is useful>
- Limits: <material constraints>
- Next decision: <decision or action>
```

## Final Response

Say what was distilled or refined, mention files touched when files changed, and list validation. Keep the response concise.
