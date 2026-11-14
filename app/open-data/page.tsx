import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { getProjects } from '@/lib/projects';
import { formatFetchedUtc } from '@/lib/directory.mjs';
import type { ListingItem } from '@/lib/listing.mjs';
import StaleBanner from '@/app/components/states/StaleBanner';
import CopyButton from './CopyButton';
import s from './open-data.module.css';

// NH-62: the open data page (mockup docs/mockups/png/OpenData.png). Everything here is read-only.
// The page is mostly static text; only the live record and the Dataset card depend on the KV read,
// so an indexer outage degrades those two cards instead of failing the whole page.

export const metadata: Metadata = {
  title: 'Open data',
  description:
    'Where NEAR Hunt data lives on NEAR, the read-only API, the agent SKILL.md, and how to read every record straight from the chain.',
  alternates: { canonical: '/open-data' },
  openGraph: {
    title: 'Open data · NEAR Hunt',
    description: 'Every NEAR Hunt record, readable straight from the chain — API, SKILL.md and schema.',
    type: 'website',
    images: [{ url: '/og/open-data.png', width: 1200, height: 630, alt: 'NEAR Hunt open data' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Open data · NEAR Hunt',
    description: 'Every NEAR Hunt record, readable straight from the chain — API, SKILL.md and schema.',
    images: ['/og/open-data.png'],
  },
};

const KV = 'https://kv.main.fastnear.com';
/** The record the mockup shows: Veto. Falls back to the first live record if it ever goes. */
const SAMPLE_ID = '21996773-48fa-43e9-aedc-684fdd2e4425';
const PROPOSAL_URL = 'https://github.com/satojandro/near-hunt/blob/main/docs/proposals/social-kv-project.md';
const SCHEMA_URL = 'https://github.com/satojandro/near-hunt/blob/main/schema/README.md';

const ENDPOINTS = [
  { path: '/api/projects?track=&sort=&q=&cursor=&limit=', what: 'A page of projects with their upvote counts' },
  { path: '/api/projects/{id}', what: 'One project record, plus where it lives on chain' },
  { path: '/api/projects/{id}/votes', what: 'Accounts that upvoted, with block heights' },
  { path: '/api/projects/{id}/discussion', what: 'Comments on nearhunt.near, oldest first' },
];

const SKILL_EXCERPT = `---
name: near-hunt
description: Browse, filter and
  shortlist NEAR Hackathon
  projects… Read-only.
---
| I want to…      | Call              |
| list projects   | /api/projects     |
| one project     | …/{id}            |
| who upvoted     | …/{id}/votes      |
| read discussion | …/{id}/discussion |`;

/** Fields `toListing` adds to a record; stripping them gives back the value stored on chain. */
const LISTING_FIELDS = new Set(['submission_id', 'key', 'account', 'block_height', 'block_timestamp']);

function recordValue(item: ListingItem): Record<string, unknown> {
  return Object.fromEntries(Object.entries(item).filter(([k]) => !LISTING_FIELDS.has(k)));
}

interface Dataset {
  records: number;
  bytes: number;
  blocks: number;
  fetched_at: string;
  sample: { id: string; block_height: number; json: string };
}

async function loadDataset(): Promise<Dataset | null> {
  try {
    const { items, fetched_at } = await getProjects();
    const values = items.map(recordValue);
    const sampleItem = items.find((p) => p.submission_id === SAMPLE_ID) ?? items[0];
    if (!sampleItem) return null;
    return {
      records: items.length,
      // Bytes of record JSON as stored (the same measure as schema/README.md "Cost of the whole dataset").
      bytes: values.reduce((n, v) => n + Buffer.byteLength(JSON.stringify(v)), 0),
      blocks: new Set(items.map((p) => p.block_height)).size,
      fetched_at,
      sample: {
        id: sampleItem.submission_id,
        block_height: sampleItem.block_height,
        json: JSON.stringify(recordValue(sampleItem), null, 2),
      },
    };
  } catch {
    return null; // Indexer down and no earlier copy: the cards say so.
  }
}

const nf = new Intl.NumberFormat('en-US');

export default async function OpenDataPage() {
  await connection(); // Render per request so the Dataset numbers are live (the KV read itself is cached ~60 s).
  const data = await loadDataset();
  const sampleId = data?.sample.id ?? SAMPLE_ID;
  const curl = `curl ${KV}/v0/latest/nearhunt.near/nearhunt.near/project/${sampleId}`;
  const fetched = data ? formatFetchedUtc(data.fetched_at) : null;

  return (
    <>
      <StaleBanner row />
      <section className={`container ${s.hero}`}>
        <p className={s.eyebrow}>Open data · read-only API · agent skill</p>
        <h1>Everything on this site is readable without this site.</h1>
        <p className={s.lede}>
          NEAR Hunt is a view over public NEAR data. If we disappear tomorrow, the projects, votes and
          conversations stay on chain and anyone can rebuild the index.
        </p>
      </section>

      <section className={`container ${s.stores}`} aria-label="Where the data lives">
        <article className={s.card}>
          <span className={s.badge}>nearhunt.near</span>
          <h2>Projects</h2>
          <p>
            One JSON record per project, written by nearhunt.near. Schema{' '}
            <a href={SCHEMA_URL}>nearhunt/project/1</a>.
          </p>
          <code className={s.key}>project/{'{submission_id}'}</code>
        </article>
        <article className={s.card}>
          <span className={s.badge}>nearhunt.near</span>
          <h2>Upvotes</h2>
          <p>
            Written by each voter from their own account. The writer is the voter, so one account can
            only ever hold one vote per project.
          </p>
          <code className={s.key}>vote/{'{submission_id}'} → {'{}'} or null</code>
        </article>
        <article className={s.card}>
          <span className={s.badge}>nearhunt.near</span>
          <h2>Comments</h2>
          <p>
            Written by each commenter from their own account, signed with the same login key as an upvote.
            The author is the writer, so only they can delete their row.
          </p>
          <code className={s.key}>comment/{'{submission_id}'}/{'{ms}'} → {'{ text, reply_to? }'} or null</code>
        </article>
      </section>

      <main className={`container ${s.main}`}>
        <div className={s.col}>
          <section className={s.card} aria-labelledby="api-h">
            <h2 id="api-h">API</h2>
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th scope="col">Request</th>
                    <th scope="col">Returns</th>
                  </tr>
                </thead>
                <tbody>
                  {ENDPOINTS.map((e) => (
                    <tr key={e.path}>
                      <td className={s.path}>
                        <span className={s.verb}>GET</span> {e.path}
                      </td>
                      <td>{e.what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={s.note}>
              Every list returns <code>items</code> and <code>next_cursor</code>, the same shape near.social
              uses. Page with <code>cursor</code> and <code>limit</code> (1 to 100). JSON only, no key, open
              to any origin. Nothing in the API writes.
            </p>
          </section>

          <section className={s.chain} aria-labelledby="chain-h">
            <div className={s.chainHead}>
              <h2 id="chain-h">One record, straight from the chain</h2>
              <CopyButton text={curl} label="Copy curl" />
            </div>
            <pre className={s.curl}>{curl}</pre>
            {data ? (
              <>
                <pre className={s.json}>{data.sample.json}</pre>
                <p className={s.chainNote}>
                  The <code>value</code> of that row as the indexer returned it to this page
                  {fetched ? <> at {fetched}</> : null}: written by nearhunt.near at block{' '}
                  {nf.format(data.sample.block_height)}.{' '}
                  <Link href={`/p/${data.sample.id}`}>See it on NEAR Hunt</Link>.
                </p>
              </>
            ) : (
              <p className={s.chainNote}>
                The NEAR indexer is not answering this page right now, so there is no live record to show.
                The curl above reads the same record without us; try it.
              </p>
            )}
          </section>
        </div>

        <aside className={s.aside}>
          <section className={s.card} aria-labelledby="skill-h">
            <h2 id="skill-h" className={s.h2Small}>For agents: SKILL.md</h2>
            <p>
              Tell your agent: read nearhunt.xyz/SKILL.md and shortlist ten projects worth investigating.
              It is read-only, so it cannot break anything.
            </p>
            <pre className={s.skill}>{SKILL_EXCERPT}</pre>
            {/* Relative link: works on nearhunt.xyz and on near-hunt.vercel.app. */}
            <a href="/SKILL.md" className={s.more}>Open SKILL.md ↗</a>
          </section>

          <section className={s.card} aria-labelledby="rules-h">
            <h2 id="rules-h" className={s.h2Small}>Rules for consumers</h2>
            <ul className={s.rules}>
              <li>Only trust project rows written by nearhunt.near.</li>
              <li>A vote&apos;s voter is the row&apos;s <code>predecessor_id</code>.</li>
              <li>A null value is a deletion. Skip it.</li>
              <li>Null fields mean unknown, not empty.</li>
              <li>Ignore fields you do not recognise.</li>
              <li>Order by block height, not by updated_at.</li>
            </ul>
          </section>

          <section className={s.card} aria-labelledby="dataset-h">
            <h2 id="dataset-h" className={s.h2Small}>Dataset</h2>
            {data ? (
              <>
                <dl className={s.stats}>
                  <dt>Records</dt>
                  <dd>{nf.format(data.records)}</dd>
                  <dt>Size</dt>
                  <dd>
                    {nf.format(Math.round(data.bytes / 1000))} KB{' '}
                    <span className={s.muted}>({nf.format(data.bytes)} bytes of JSON)</span>
                  </dd>
                  <dt>Written in</dt>
                  <dd>
                    {nf.format(data.blocks)} {data.blocks === 1 ? 'block' : 'blocks'}{' '}
                    <span className={s.muted}>(distinct block heights of the latest versions)</span>
                  </dd>
                  <dt>Contract</dt>
                  <dd>None needed</dd>
                </dl>
                <p className={s.small}>
                  Computed live from the current records written by nearhunt.near
                  {fetched ? <>, read {fetched}</> : null}.
                </p>
              </>
            ) : (
              <p className={s.small}>
                Live numbers are unavailable: the NEAR indexer is not answering this page right now. The
                records are safe on chain under nearhunt.near.
              </p>
            )}
          </section>

          <section className={s.card} aria-labelledby="proposal-h">
            <span className={`${s.badge} ${s.badgeDraft}`}>Draft proposal</span>
            <h2 id="proposal-h" className={s.h2Small}>Projects as a near.social data object</h2>
            <p>
              A draft proposal to add a <code>project/</code> key to the near.social standard, so builders can
              publish their own project records. It is for after the hackathon, has not been submitted, and
              nothing is written on chain for it.
            </p>
            <a href={PROPOSAL_URL} className={s.more}>Read the draft on GitHub ↗</a>
          </section>

          {/* NH-94: the support link. It supports the site, not any project. */}
          <p className={s.small}>
            Find this data useful? <Link href="/support">Support NEAR Hunt</Link>: it supports the site, not
            any project.
          </p>
        </aside>
      </main>
    </>
  );
}
