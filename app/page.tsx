import Link from 'next/link';
import { getProjects } from '@/lib/projects';
import { getVoteCounts } from '@/lib/votes';
import { buildHref, directoryView, formatFetchedUtc, type SearchParamsRecord, type Votes } from '@/lib/directory.mjs';
import { trackLabel } from '@/lib/tracks.mjs';
import Sidebar from '@/app/components/sidebar/Sidebar';
import SearchBox from '@/app/components/directory/SearchBox';
import ProjectCard from '@/app/components/directory/ProjectCard';
import { SortTabs, TrackChips } from '@/app/components/directory/DirectoryControls';
import { getReplyCounts } from '@/app/components/discussion/reply-counts';
import './directory.css';

// Directory: search (NH-12), track chips (NH-13), sort (NH-14). All state lives in the URL
// (`?q=&track=&sort=`) and is rendered on the server.
export default async function Home({ searchParams }: { searchParams: Promise<SearchParamsRecord> }) {
  const [{ items, fetched_at, account }, params, tally] = await Promise.all([
    getProjects(), searchParams, getVoteCounts(),
  ]);

  // Vote counts by submission_id (NH-33): active `vote/{id}` rows under the vote account, one per
  // voter, counted only for live projects. If the votes read fails the map is empty and the
  // status line says the tally is unavailable; the directory itself still renders.
  const votes: Votes = tally.counts;
  // NH-43: near.social reply counts, only for projects that have a discussion post (none yet).
  const discussion = await getReplyCounts(items);

  const { state, total, results, chips } = directoryView(items, params, votes, discussion.counts);
  const fetched = formatFetchedUtc(fetched_at);
  const noVotesYet = state.sort === 'upvoted' && results.every((p) => !votes[p.submission_id]);
  const noDiscussionYet = state.sort === 'discussed' && results.every((p) => !discussion.counts[p.submission_id]);

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
          <SortTabs state={state} discussed={discussion.asked > 0} />
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
            {!tally.available
              ? ' · upvote counts are unavailable right now'
              : noVotesYet && results.length > 0 ? ' · no votes yet, so this is newest first' : ''}
            {state.sort === 'discussed' && !discussion.available
              ? ' · reply counts are unavailable right now'
              : noDiscussionYet && results.length > 0 ? ' · no replies yet, so this is newest first' : ''}
          </p>

          {results.length > 0 ? (
            <ol className="dir-list">
              {results.map((item, i) => (
                <ProjectCard key={item.submission_id} item={item} rank={i + 1} votes={votes[item.submission_id] ?? 0} replies={discussion.counts[item.submission_id]} />
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
