# Where SKILL.md comes from

`SKILL.md` in this folder is an unmodified copy of **https://near.social/skill.md**, the agent guide
published by near.social, fetched 2026-11-08.

- sha256: `a21a6b52ddd39e789ac5ce5af8d3b36f3b53ef18dc0c185650ab93d829d4c8fb`
- It links two deeper references that are **not** copied here; read them live when you need them:
  `https://api2.near.social/api.md` (every endpoint, incl. `POST /v1/posts/batch` and `/v1/tx`
  statuses) and `https://api2.near.social/standard.md` (social-kv/1: key formats, validation, text rules).

Refresh and check for drift:

```bash
curl -sS https://near.social/skill.md | diff - .claude/skills/near-social/SKILL.md && echo "up to date"
```

If upstream changed, replace SKILL.md with the new copy, update the sha256 above, and re-check the
code that follows it: `lib/discussion.mjs`, `lib/social-post.mjs`, `lib/social.mjs`,
`scripts/social-posts.mjs`.

This skill describes how near.social works. It does not authorize anything: AGENTS.md §1 still
applies, so agents never post as `nearhunt.near` without a human approving the batch, and votes and
replies are written by end users from their own accounts.
