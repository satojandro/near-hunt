import Link from 'next/link';
import { getProjects } from '@/lib/projects';
import { buildHref, directoryView, formatFetchedUtc, type SearchParamsRecord, type Votes } from '@/lib/directory.mjs';
import { trackLabel } from '@/lib/tracks.mjs';
import Sidebar from '@/app/components/sidebar/Sidebar';
import SearchBox from '@/app/components/directory/SearchBox';
import ProjectCard from '@/app/components/directory/ProjectCard';
import { SortTabs, TrackChips } from '@/app/components/directory/DirectoryControls';
import './directory.css';

// Directory: search (NH-12), track chips (NH-13), sort (NH-14). All state lives in the URL
// (`?q=&track=&sort=`) and is rendered on the server.
export default async function Home({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const [{ items, fetched_at, account }, params] = await Promise.all([getProjects(), searchParams]);

  // Vote counts by submission_id. Votes arrive with account connect (NH-33, Day 2); until then
  // this is empty and every card shows 0. Nothing here is invented.
  const votes: Votes = {};

  const { state, total, results, chips } = directoryView(items, params, votes);
  const fetched = formatFetchedUtc(fetched_at);
  const noVotesYet = state.sort === 'upvoted' && results.every((p) => !votes[p.submission_id]);

  return (
    <>
      <section className="container dir-hero">
        <p className="dir-eyebrow">NEAR Hackathon · 1–14 Nov 2026</p>
        <h1>{total} projects. Upvote the ones you would actually use.</h1>
        <p className="dir-lede">
          Every project is an open record on NEAR. Every upvote is a transaction you sign, and every
          comment is a near.social post you own. Votes are community signals, not official judging.
        </p>
      </section>

      <section className="container dir-controls" aria-label="Find projects">
        <SearchBox q={state.q} track={state.track} sort={state.sort} total={total} />
        <div className="dir-tabs-row">
          <SortTabs state={state} />
          <p className="dir-provenance">
            Read from NEAR mainnet · {account}
            {fetched ? <> · fetched <time dateTime={fetched_at}>{fetched}</time></> : null}
          </p>
        </div>
        <TrackChips state={state} chips={chips} />
      </section>

      <main className="container dir-main">
        <div className="dir-list-col">
          <p className="dir-status" aria-live="polite">
            {results.length === total
              ? `Showing all ${total} projects`
              : `Showing ${results.length} of ${total} projects`}
            {state.track ? ` in ${trackLabel(state.track)}` : ''}
            {state.q ? ` matching “${state.q}”` : ''}
            {noVotesYet && results.length > 0 ? ' · no votes yet, so this is newest first' : ''}
          </p>

          {results.length > 0 ? (
            <ol className="dir-list">
              {results.map((item, i) => (
                <ProjectCard key={item.submission_id} item={item} rank={i + 1} votes={votes[item.submission_id] ?? 0} />
              ))}
            </ol>
          ) : (
            <div className="dir-empty">
              <p className="dir-empty-title">
                {state.q ? <>No project names match “{state.q}”.</> : <>No projects in this track.</>}
              </p>
              {state.q ? (
                <p>Search covers project names only — the hackathon feed has no descriptions.</p>
              ) : null}
              <p className="dir-empty-actions">
                {state.q ? <Link href={buildHref(state, { q: '' })}>Clear search</Link> : null}
                {state.track ? <Link href={buildHref(state, { track: null })}>Show all tracks</Link> : null}
              </p>
            </div>
          )}
        </div>

        <aside className="dir-aside">
          <Sidebar />
        </aside>
      </main>
    </>
  );
}
