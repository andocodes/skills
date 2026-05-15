---
name: clarify
description: Use when the user asks to clarify, simplify, clean up, tidy, normalize, standardise, or refine existing code while preserving exact behavior, especially after recent edits or before a larger rewrite. Apply to codebases, modules, tests, CLIs, schemas, adapters, scaffolds, or generated skeletons when the goal is maintainability rather than new functionality.
---

# Clarify

Refine existing code toward high standards of elegance and maintainability while preserving exact behavior and local conventions. Approach the work as an expert code simplification specialist: use project-specific best practices, prefer readable and explicit code, and act on clear refinement opportunities instead of only suggesting them. Keep scope anchored to the user's request or recent changes.

## Workflow

1. Identify the target surface.
   - Start with `git status --short`, `git diff --stat`, and the recently modified files unless the user names a different scope.
   - Check local guidance such as `AGENTS.md`, `CLAUDE.md`, `README.md`, package docs, or style docs when present and relevant.
   - Read the surrounding implementation before editing. Let local patterns decide style.
   - Keep unrelated dirty work untouched.

2. Find meaningful simplification opportunities.
   - Look for repeated literals, duplicated enum/value lists, repeated parsing logic, nested conditionals, long functions mixing concerns, drift between tests/docs/code, and comments that restate obvious code.
   - Prefer one clear owner for shared concepts. Examples: schema owns valid values, image builder owns image presets, launcher owns adapter behavior.
   - Preserve helpful abstractions. Do not flatten code just to reduce line count.

3. Refactor conservatively.
   - Keep behavior, public contracts, file formats, CLI output shape, and validation semantics unchanged unless the user explicitly asks.
   - Stop before broad rewrites, dependency changes, public API changes, or repo-wide style migrations unless explicitly requested.
   - Replace nested ternaries with `if`/`else` or `switch`.
   - Use descriptive names for extracted helpers. Avoid vague names like `handleThing`, `doStuff`, or `processData`.
   - Consolidate related logic when it improves locality. Split logic when a function is handling separate decisions.
   - Prefer data tables for small, stable adapter maps when they make extension clearer. Prefer `switch` when branches need distinct logic.
   - Remove comments that narrate obvious code. Keep short comments only when they explain a non-obvious constraint.

4. Respect language and project conventions.
   - Use existing formatters, test runners, schemas, helper APIs, and naming style.
   - In Go code, preserve package documentation. If adding or stubbing package skeletons, maintain `doc.go` where the project uses it.
   - Keep `doc.go` plain: describe what the package provides, not what was added, removed, or changed.
   - Do not introduce new dependencies, code generators, or broad architectural patterns for a cleanup pass unless the repo already uses them.

5. Validate.
   - Run the smallest meaningful check first, then the project’s normal validation if practical.
   - Use `git diff --check` when editing code or docs.
   - If tests cannot be run, state why and what risk remains.

## Review Checklist

Before finishing, check:

- Is each shared concept defined in one place?
- Did any helper extraction make debugging or extension harder?
- Did the change reduce drift between code, tests, docs, and CLI/help text?
- Are conditionals explicit enough to read without mental gymnastics?
- Are names specific to the domain rather than generic?
- Did validation cover the touched behavior?

## Final Response

Keep the response short and plain. Say what the code now does more consistently, mention the files touched, and list validation. Do not write a long change diary or explain every removed line.
