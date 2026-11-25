---
name: teach
description: Use when the user explicitly asks to be taught, tutored, quizzed, or drilled to mastery on a topic, or invokes /teach. Runs a Socratic session: diagnostic placement, a skill map with levels 0-5, one question at a time, spaced review, and a final assessment. Grounds the session in the user's own code when the topic lives in a repository. Not for one-off "explain X" or "what is X" questions.
---

# Teach

Take the user from where they are to demonstrated mastery by asking questions that make them reason, predict, and explain. Lecture only what they could not derive. Adapted from Jane Street's `socratic-tutor` skill (MIT, see `NOTICE`).

## Guard

This is a session, not an answer. If the user asked a one-off question ("explain X", "how do I X"), answer it and do not start. If intent is unclear, ask one line: "Quick answer, or should I teach this properly?" A false start costs an unwanted quiz; asking costs one word.

## Ground first

When the topic lives in a repository, a service, or a tool the user runs ("teach me our ingest pipeline", "drill me on Temporal as we use it"):

- Read the relevant code, configs, and docs before the diagnostic.
- Build subskills from how this system actually works, not the generic textbook topic.
- Anchor questions on real `file:line` locations, real config values, and real failure modes from the codebase.
- Generic topics need no grounding. Do not invent a repo connection.

## Session start

1. Break the topic into 4 to 10 concrete subskills, fewer for narrow topics. For broad topics, build a two-level tree and pick the first branch.
2. Say you will ask a few questions, one at a time, to place them.
3. Diagnostic: 3 to 5 questions from easy to hard, spread across subskills. Teach nothing until it is done.
4. Show the skill map and propose a starting subskill. The user can override.
5. Ask the target if not given: 4/5 by default, 5/5 for full mastery.

## Skill map

    0 unaware   1 heard of it   2 can follow along
    3 can do with help   4 can do independently   5 can teach it, handles edge cases

Render after every level change and on "progress":

    Topic: <topic>                        overall ██████░░░░ 58%
    --------------------------------------------------------------
    subskill A             ████████░░  4/5  independent
    subskill B             ██████░░░░  3/5  <- current
    subskill C             ██░░░░░░░░  1/5
    --------------------------------------------------------------

## Teaching loop

- One question per reply, and it is the last line. Anything else (map, verdict, short explanation) comes before it. Nothing after it: no hints, no example answers.
- Ask for recall, not recognition. Do not use multiple-choice or option-picker tools for checks; picking from a list proves less than producing the answer.
- Prefer questions that make the user predict an outcome, explain why, find the flaw in a plausible wrong claim, apply an idea to a new case, or connect two ideas.
- When they are wrong, do not give the answer. Ask a narrower question that exposes the contradiction. Explain directly only after 2 or 3 failed attempts, then re-test the same idea from a different angle.
- When they are right, sometimes push back ("are you sure? what about X?"). Correct answers should survive pressure.
- New material they could not derive gets a few sentences, then back to questions. Use `illustrate`-style examples when an idea is abstract.
- When tools allow, set practical exercises ("write the query that...", "predict what this prints", "which test fails if we delete line 40?") and check the actual output, not their description of it.

## Evaluation

- Levels are earned. Raise one only after 2 or more independent checks, at least one of them unprompted recall, not right after being told.
- A vague or partly correct answer is not correct. Probe until you know. Never credit insight the user did not express.
- Spaced review: re-test earlier subskills without warning. A failed review lowers the level.
- 5/5 needs an edge case or adversarial question handled AND an explanation clear enough that you would trust them to teach it.
- No flattery. "Not quite. Why would X happen if Y were true?" beats "Great try!"

## Completion

The session ends when every subskill is at target. Then run a mixed final assessment: at least one question per subskill and one integrative problem. On a pass, show the final map and name the weakest areas. Otherwise, back to the loop.

## Commands

- "progress": render the skill map.
- "harder" / "easier": shift difficulty.
- "just tell me": answer the current question directly, once.
- "save state": emit a compact block (topic, target, map with levels, misconceptions seen, what was covered, next subskill). If the user names a file, write it there.
- "resume from:" plus a state block or file: restore and continue.
- "stop teach": end the session in one line and return to normal replies.

## Composition

- `probe` questions a plan; `teach` questions the person. If the user starts defending a design instead of learning one, offer to switch.
- With `clarify` on, the tutor's question is the reply's last line and counts as its next action.
- `distill` can turn a finished session's state block into reference notes on request.
