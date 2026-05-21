---
name: openspec-new-change
description: Start a new OpenSpec change using the experimental artifact workflow. Use when the user wants to create a new feature, fix, or modification with a structured step-by-step approach.
license: MIT
compatibility: Requires openspec CLI.
metadata:
  author: openspec
  version: "1.0"
  generatedBy: "1.3.1"
---

Start a new change using the experimental artifact-driven approach.

**Input**: The user's request should include a change name (kebab-case) OR a description of what they want to build.

**Steps**

1. **If no clear input provided, ask what they want to build**

   Use the **AskUserQuestion tool** (open-ended, no preset options) to ask:
   > "What change do you want to work on? Describe what you want to build or fix."

   From their description, derive a kebab-case name (e.g., "add user authentication" → `add-user-auth`).

   **IMPORTANT**: Do NOT proceed without understanding what the user wants to build.

2. **Grill-Me Discovery Interview**

   Before creating anything, interview the user until you are genuinely satisfied that you and the user are aligned on what this change looks like. Don't follow a script — ask whatever you need to ask.

   **First: research the codebase** — explore related code, existing patterns, integration points, and constraints. This grounds your questions and lets you propose informed answers rather than asking blindly.

   **Then interview the user.** Ask as many questions as you need, in whatever order makes sense. When you have a hypothesis or a suggested answer, offer it — don't just ask open questions. The user should be able to say "yes that's right" or correct you. Keep going until you would be comfortable making every key decision in the proposal without guessing.

   Things you might need to understand (not a checklist — just a guide for what "aligned" means):
   - What problem this solves and why it matters now
   - What's in scope and what isn't
   - Who uses this and how
   - The technical direction and why
   - What could go wrong or is unknown
   - What the change touches in the codebase
   - What "done" looks like

   **When you're satisfied, show a Discovery Summary** capturing what you've learned:
   ```
   ## Discovery Summary

   [Free-form summary of everything you've aligned on — not a rigid template.
    Write it as a clear statement of the change: what it is, why, how, and what to watch out for.]
   ```

   Ask: "Does this capture it correctly? Any corrections before I create the change?"

   **Wait for confirmation before proceeding.** If the user corrects anything, update and re-confirm.

3. **Determine the workflow schema**

   Use the default schema (omit `--schema`) unless the user explicitly requests a different workflow.

   **Use a different schema only if the user mentions:**
   - A specific schema name → use `--schema <name>`
   - "show workflows" or "what workflows" → run `openspec schemas --json` and let them choose

   **Otherwise**: Omit `--schema` to use the default.

4. **Create the change directory**
   ```bash
   openspec new change "<name>"
   ```
   Add `--schema <name>` only if the user requested a specific workflow.
   This creates a scaffolded change at `openspec/changes/<name>/` with the selected schema.

5. **Show the artifact status**
   ```bash
   openspec status --change "<name>"
   ```
   This shows which artifacts need to be created and which are ready (dependencies satisfied).

6. **Get instructions for the first artifact**
   The first artifact depends on the schema (e.g., `proposal` for spec-driven).
   Check the status output to find the first artifact with status "ready".
   ```bash
   openspec instructions <first-artifact-id> --change "<name>"
   ```
   This outputs the template and context for creating the first artifact.

7. **STOP and wait for user direction**

**Output**

After completing the steps, summarize:
- Change name and location
- Schema/workflow being used and its artifact sequence
- Current status (0/N artifacts complete)
- The template for the first artifact
- Prompt: "Ready to create the first artifact? Just describe what this change is about and I'll draft it, or ask me to continue."

**Guardrails**
- Do NOT skip or abbreviate the Discovery Interview (step 2) — it is required for every new change
- Do NOT create the change directory until the user confirms the Discovery Summary
- Do NOT create any artifacts yet — just show the instructions
- Do NOT advance beyond showing the first artifact template
- Suggested answers in the interview MUST be grounded in actual codebase research, not generic placeholders
- If the name is invalid (not kebab-case), ask for a valid name
- If a change with that name already exists, suggest continuing that change instead
- Pass --schema if using a non-default workflow
