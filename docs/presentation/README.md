# NEAR Hunt demo presentation

The 16-slide deck used to present NEAR Hunt at the end of the NEAR Hackathon (14 Nov 2026).

| File | What it is |
|---|---|
| [`near-hunt-demo.pdf`](near-hunt-demo.pdf) | The slides, one 1920×1080 page each |
| [`near-hunt-demo.html`](near-hunt-demo.html) | The same slides as one web page (open it in a browser) |
| [`speaker-notes.md`](speaker-notes.md) | What to say on each slide, with the live-site demo cues |
| [`images/`](images/) | The screenshots the slides use, captured from nearhunt.xyz on 14 Nov 2026 |

The deck covers the hack's objectives, the near.social integration (login, profiles, the share
loop and the live `#nearhunt` feed), the open data approach (FastData KV rows, the read path, the
API and `SKILL.md`), the UI/UX, builder claims, the Support page and the roadmap.

## The numbers in the deck

Measured on 14 Nov 2026 at 22:40 UTC. They keep moving while people vote and the feed stays open.

| Slide figure | Value | Reproduce |
|---|---|---|
| Project records on mainnet, written by `nearhunt.near` | 2,130 | `npm run validate:schema`, or count `readProjects()` from [`lib/kv.mjs`](../../lib/kv.mjs) |
| NEAR accounts that signed an upvote / vote rows | 287 / 395 | distinct `predecessor_id` and row count of the `vote/` rows (below) |
| Accounts that commented / comment rows | 58 / 70 | the same, for `comment/` |
| NEAR accounts linked to a project | 22 | the same, for `maker/` |
| `#nearhunt` posts on near.social / their authors | 48 / 38 | `curl -s "https://api2.near.social/v1/hashtags/nearhunt?limit=100"`, count `items` and distinct `post.author.account_id` |
| Correction issues filed by builders | 36 | [issues matching "correction"](https://github.com/satojandro/near-hunt/issues?q=is%3Aissue+correction) |

Reading the `vote/`, `comment/` and `maker/` rows (no wallet, no key):

```bash
node --input-type=module -e "
import { readLatest } from './lib/kv.mjs';
for (const p of ['vote/', 'comment/', 'maker/']) {
  const rows = await readLatest({ account: 'nearhunt.near', keyPrefix: p });
  console.log(p, 'rows', rows.length, 'accounts', new Set(rows.map((r) => r.predecessor_id)).size);
}"
```

The site's own count (`curl -s "https://nearhunt.xyz/api/projects?limit=1"` → `meta.total`) is one
lower than the record count, because one project is on the [hide list](../../data/hidden-projects.json).

## How it was made

The deck was written with Claude in a Slides artifact and exported here with Playwright. The icons
are from [Lucide](https://lucide.dev) (ISC licence), inlined as SVG.
