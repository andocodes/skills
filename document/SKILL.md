---
name: document
description: Use when the user asks to document a codebase, write or refine project documentation, create a concise README, docs page, architecture note, API or CLI reference, runbook, contribution guide, executive summary, or reader-ready code documentation. Focus on verified, concise, present-tense documentation for developers, users, maintainers, or executives. Do not use for general DOCX/PDF/file-format document editing unless the task is project documentation content.
---

# Document

Write reader-ready project documentation that is concise, verified, and useful. Explain what is true now and how to act. Do not narrate the work that produced it.

## Workflow

1. Define the reader and output.
   - Default to developer-facing, open-source-style documentation.
   - Use explicit audience modes when requested: `developer`, `user`, `maintainer`, or `executive`.
   - Choose the smallest useful artifact: README section, full README, docs page, reference, runbook, summary, or code documentation.
   - Ask only when audience or scope would materially change the output.

2. Ground in source artifacts.
   - Inspect existing README/docs, package metadata, CLI help, config schemas, tests, examples, public APIs, source comments, and recent diffs when relevant.
   - Write verified claims only. Omit uncertain claims, label them as assumptions, or ask for confirmation.
   - Prefer commands, options, examples, and terminology that already exist in the project.
   - Preserve accurate existing documentation instead of rewriting for novelty.

3. Choose the structure.
   - Prefer README-first. Treat the README as the front door: what it is, who it is for, quick start, core concepts, common workflows, and links.
   - Ask before creating or reorganizing a `docs/` folder.
   - When a `docs/` folder is approved or already established, use an index README and split stable deeper material into focused pages such as architecture, CLI reference, deployment, adapters, auth, operations, or contributing.
   - Avoid scaffolding extra pages for small projects.

4. Write minimum sufficient docs.
   - Use the shortest documentation that lets the target reader act correctly.
   - Prefer present tense, active voice, concrete commands, examples, and direct section headings.
   - Put the happy path before internals. Link or defer deeper details when they are not needed for first use.
   - Cut filler, marketing language, apologies, and meta-commentary.

5. Keep history out unless requested.
   - Do not write implementation diary language such as "we added", "we removed", "now supports", "this used to", "legacy", or "during this refactor".
   - Use historical context only for changelogs, migration notes, deprecations, or explicit rationale docs.
   - Describe current behavior and current constraints plainly.

6. Handle code documentation deliberately.
   - Edit inline comments and docstrings only when the user asks for code documentation or points at source files.
   - Use comments/docstrings for public contracts, non-obvious constraints, examples, and why something must work a certain way.
   - Remove or avoid comments that restate obvious code.

## Audience Defaults

- `developer`: setup, quick start, concepts, workflows, extension points, tests, and troubleshooting.
- `user`: what it does, common tasks, examples, configuration, and expected outcomes.
- `maintainer`: architecture, invariants, operations, releases, debugging, and ownership boundaries.
- `executive`: purpose, value, current capability, limits, risks, and next decisions.

## Output Patterns

Use one of these shapes when it fits:

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

Say what documentation was created or refined, mention the files touched, and list validation. Keep the response concise.
