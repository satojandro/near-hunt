import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProjects } from '@/lib/projects';
import { NETWORK, VOTE_ACCOUNT } from '@/lib/network.mjs';
import { isAccountId, relativeTime } from '@/lib/social.mjs';
import { trackLabel } from '@/lib/tracks.mjs';
import { accountUpvotes, fetchAccountProfile, nsToMs, readAccountVoteRows } from '@/lib/account.mjs';
import ProfileHeader from '@/app/components/account/ProfileHeader';
import UpvotesList, { type UpvoteRow } from '@/app/components/account/UpvotesList';
import s from '@/app/components/account/account.module.css';

type Props = {
  params: Promise<{ account: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
};

/** Per-request timeout for the account's vote read: a slow indexer must not hold the page. */
const VOTES_TIMEOUT_MS = 5000;

// No loading.tsx on purpose: a streamed fallback would commit a 200 before notFound() can set 404.

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { account } = await params;
  if (!isAccountId(account)) return { title: 'Account not found', robots: { index: false } };
  return {
    title: account,
    description: `Projects ${account} upvoted on NEAR Hunt. Votes are written by the voter on NEAR and read from the public FastData index.`,
    alternates: { canonical: `/u/${account}` },
    robots: { index: false },
  };
}

/**
 * NH-51: the account's active upvotes on live projects, newest first. `null` when the vote rows
 * or the project list could not be read: the page then says so instead of showing an empty list.
 */
async function loadUpvotes(accountId: string): Promise<UpvoteRow[] | null> {
  try {
    const [rows, { items }] = await Promise.all([
      readAccountVoteRows({
        accountId,
        account: VOTE_ACCOUNT,
        network: NETWORK,
        fetchImpl: (input, init) => fetch(input, { ...init, cache: 'no-store', signal: AbortSignal.timeout(VOTES_TIMEOUT_MS) }),
      }),
      getProjects(),
    ]);
    const now = Date.now();
    return accountUpvotes(rows, accountId, items).map((v) => {
      const ms = nsToMs(v.block_timestamp);
      return {
        id: v.id,
        name: v.project.name,
        tracks: v.project.tracks.map(trackLabel),
        when: ms ? `Upvoted ${relativeTime(ms, now)}` : null,
        block_height: v.block_height,
      };
    });
  } catch (err) {
    console.error('[account] upvotes read failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** `/u/{account}` — Board 3: NH-50 (header), NH-51 (upvotes), NH-53 (remove), NH-52 (comments tab). */
export default async function AccountPage({ params, searchParams }: Props) {
  const { account } = await params;
  if (!isAccountId(account)) notFound();
  const { tab } = await searchParams;
  const showComments = tab === 'comments';

  const [{ status, profile }, upvotes] = await Promise.all([fetchAccountProfile(account), loadUpvotes(account)]);

  return (
    <main className={`container ${s.page}`}>
      <ProfileHeader profile={profile} profileStatus={status} upvoteCount={upvotes ? upvotes.length : null} />

      <nav className={s.tabs} aria-label="Account activity">
        <Link
          href={`/u/${account}`}
          className={`${s.tab} ${showComments ? '' : s.tabActive}`}
          aria-current={showComments ? undefined : 'page'}
          scroll={false}
        >
          Upvoted
        </Link>
        <Link
          href={`/u/${account}?tab=comments`}
          className={`${s.tab} ${showComments ? s.tabActive : ''}`}
          aria-current={showComments ? 'page' : undefined}
          scroll={false}
        >
          Comments
        </Link>
      </nav>

      {showComments ? (
        <section aria-label="Comments">
          {/* NH-52: no NEAR Hunt discussion threads exist on near.social yet (NH-41/42), so there is
              nothing to filter this account's posts against. Honest empty state, no request. */}
          <p className={s.empty}>
            Comments appear here once project discussions open on near.social.
          </p>
        </section>
      ) : (
        <section aria-label="Upvoted projects">
          {upvotes === null ? (
            <p className={s.empty} role="status">
              Upvotes unavailable right now: the NEAR index could not be read. Try again in a minute.
            </p>
          ) : (
            <UpvotesList accountId={account} rows={upvotes} />
          )}
          <p className={s.note}>
            Votes are rows this account wrote to {VOTE_ACCOUNT} on NEAR {NETWORK} (keys vote/…). Votes for
            projects no longer in the feed are not shown.
          </p>
        </section>
      )}
    </main>
  );
}
