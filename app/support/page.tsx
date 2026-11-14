import type { Metadata } from 'next';
import Link from 'next/link';
import { NETWORK, VOTE_ACCOUNT } from '@/lib/network.mjs';
import { explorerAccountUrl, accountFromEnv } from '@/lib/support.mjs';
import CopyButton from '@/app/open-data/CopyButton';
import SupportForm from './SupportForm';
import s from './support.module.css';

// NH-121: support page. Two ways to help, both signed by the visitor in their own wallet:
// a NEAR transfer to the account that runs NEAR Hunt, and (once NEXT_PUBLIC_STAKING_POOL is set)
// a stake with the owner's validator. Nothing here is signed by a server or an agent.

export const metadata: Metadata = {
  title: 'Support NEAR Hunt',
  description: 'Keep NEAR Hunt free and open: donate NEAR directly or stake with our validator.',
  alternates: { canonical: '/support' },
};

/**
 * Who receives donations. Owner decision 14 Nov: the account that runs NEAR Hunt. Set
 * NEXT_PUBLIC_DONATION_ACCOUNT to move them to a separate treasury (NH-94's original plan)
 * without a code change.
 */
const DONATION_ACCOUNT = accountFromEnv(process.env.NEXT_PUBLIC_DONATION_ACCOUNT) ?? VOTE_ACCOUNT;
/**
 * The owner's validator (owner, 14 Nov): `avb.poolv1.near`, checked on mainnet the same day
 * (`get_owner_id` misfits-validator.near, in the current validator set, staking not paused).
 * NEXT_PUBLIC_STAKING_POOL overrides it; on testnet there is no default, so the card hides.
 */
const DEFAULT_POOL = NETWORK === 'mainnet' ? 'avb.poolv1.near' : null;
const POOL = accountFromEnv(process.env.NEXT_PUBLIC_STAKING_POOL) ?? DEFAULT_POOL;

export default function SupportPage() {
  return (
    <main>
      <section className={`container ${s.hero}`}>
        <p className={s.eyebrow}>Support the project</p>
        <h1>Keep NEAR Hunt free, open and running</h1>
        <p className={s.lede}>
          NEAR Hunt has no token, no ads in the ranking and no paywall. Every project, vote and comment
          lives on NEAR mainnet for anyone to read. If it helped you find, judge or show off a project,
          you can help keep it going after the hackathon.
        </p>
      </section>

      <section className={`container ${s.grid}`} aria-label="Ways to support">
        <article className={s.card}>
          <span className={s.badge}>Donate</span>
          <h2>Send NEAR directly</h2>
          <p>
            Goes to <code>{DONATION_ACCOUNT}</code>, which runs NEAR Hunt. It supports the site, not any
            project, and never changes a ranking. Every transfer is public on chain.
          </p>
          <SupportForm mode="donate" receiverId={DONATION_ACCOUNT} />
          <div className={s.addressRow}>
            <code className={s.address}>{DONATION_ACCOUNT}</code>
            <CopyButton text={DONATION_ACCOUNT} label="Copy account" />
          </div>
          <p className={s.small}>
            Prefer your own wallet? Send to the account above.{' '}
            <a href={explorerAccountUrl(DONATION_ACCOUNT, NETWORK)} target="_blank" rel="noopener noreferrer">
              See it on NearBlocks
            </a>
            .
          </p>
        </article>

        <article className={s.card}>
          <span className={s.badge}>Stake</span>
          <h2>Stake with our validator</h2>
          <p>
            Costs you nothing: your NEAR stays yours, keeps earning staking rewards, and can be unstaked
            at any time (funds unlock after about 2 days). The validator&apos;s commission helps fund NEAR
            Hunt, and you help secure the network. The pool&apos;s commission and track record are public on
            chain.
          </p>
          {POOL ? (
            <>
              <SupportForm mode="stake" receiverId={POOL} />
              <div className={s.addressRow}>
                <code className={s.address}>{POOL}</code>
                <CopyButton text={POOL} label="Copy pool" />
              </div>
              <p className={s.small}>
                You can also stake from any wallet that supports staking: search for the pool above.{' '}
                <a href={explorerAccountUrl(POOL, NETWORK)} target="_blank" rel="noopener noreferrer">
                  See the pool on NearBlocks
                </a>
                .
              </p>
            </>
          ) : (
            <p className={s.soon}>The validator&apos;s pool is being set up. Check back soon.</p>
          )}
        </article>
      </section>

      <section className={`container ${s.other}`}>
        <h2>Other ways to help, free</h2>
        <ul>
          <li>
            <Link href="/">Upvote and comment</Link> on projects you like. It is what makes the ranking
            worth reading.
          </li>
          <li>Share a project page on near.social or X.</li>
          <li>
            Star the{' '}
            <a href="https://github.com/satojandro/near-hunt" target="_blank" rel="noopener noreferrer">
              repository
            </a>{' '}
            or build on the <Link href="/open-data">open data</Link>.
          </li>
        </ul>
      </section>
    </main>
  );
}
