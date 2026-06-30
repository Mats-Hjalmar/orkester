---
name: create-issue
description: Draft and file a GitHub issue for this repo with mandatory "Why / Context" and "How to verify it works" sections. Use only when the user explicitly asks to create an issue.
disable-model-invocation: true
argument-hint: "[short title or topic]"
allowed-tools: Bash(gh issue create *)
---

# Create a GitHub issue

File a well-structured issue against `Mats-Hjalmar/orkester`. Every issue this
skill creates must answer two questions: **why it matters** and **how to know
it's done**. Draft first, confirm with the user, then create.

## Steps

1. **Gather the title and the "what".**
   - Use `$ARGUMENTS` (the topic the user passed to `/create-issue`) and the
     surrounding conversation as the seed for the title and the change.
   - If you don't have enough to write a real title or a real "Why", **ask the
     user** — do not invent a placeholder title or fabricate context. (No silent
     fallbacks.)
   - For repo conventions, read `app/AGENTS.md` — it's the canonical
     agent-instruction file (the repo uses the AGENTS.md convention; `app/CLAUDE.md`
     just points to it, and there is no root-level one).

2. **Draft the body** with exactly this structure. An optional one-line summary
   of the change may go on top:

   ```
   <optional one-line summary of the change>

   ## Why / Context
   <the problem or need that prompted this, and why it matters now>

   ## How to verify it works
   <a concrete, observable end-to-end check: a real CLI invocation (e.g.
    `orkester status lobby`), a test command, or a UI action — with the expected
    output. NOT "run the tests". If no real smoke test is possible, say so
    explicitly here instead of inventing a passing-looking one.>
   ```

3. **Confirm before creating.** Show the user the complete title and body and ask
   them to approve or edit. Do **not** create the issue on the first pass.

4. **Create it safely.** Once approved, write the final body to a scratchpad file
   with the Write tool (so markdown — newlines, backticks, `#`, `$` — is never
   passed through the shell), then:

   ```sh
   gh issue create --repo Mats-Hjalmar/orkester \
     --title "<title>" --body-file <scratchpad>/issue-body.md
   ```

   Always pass `--repo Mats-Hjalmar/orkester` so creation never depends on the
   current directory's remote. Print the returned issue URL to the user.

## Guardrails

- Don't add labels, assignees, milestones, or templates that don't already exist
  in the repo.
- Never create the issue before the user has approved the drafted title + body.
- If the "How to verify it works" section can't be filled with a genuine check,
  state that plainly in the issue rather than faking one.
