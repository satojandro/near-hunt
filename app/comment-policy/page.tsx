import type { Metadata } from 'next';
import Link from 'next/link';
import { MAX_COMMENT_CHARS } from '@/lib/comments.mjs';
import s from './comment-policy.module.css';

// NH-44: the one-page comment policy. Comments are public rows on nearhunt.near written by the
// commenter's own account, so this page explains what NEAR Hunt hides, what it cannot delete, and
// how hiding actually works (a reviewed change to data/hidden-comments.json, never a write).

export const metadata: Metadata = {
  title: 'Comment policy',
  description:
    'How comments work on NEAR Hunt: signed rows on NEAR, what NEAR Hunt hides, and why nobody can delete your comment but you.',
  alternates: { canonical: '/comment-policy' },
};

const REPORT_URL = 'https://github.com/satojandro/near-hunt/issues/new';

export default function CommentPolicyPage() {
  return (
    <main className={`container ${s.page}`}>
      <header className={s.hero}>
        <p className={s.eyebrow}>Policy</p>
        <h1>Comment policy</h1>
        <p className={s.lede}>
          Every comment on NEAR Hunt is a public row on the NEAR blockchain, written and signed by the
          commenter&apos;s own account. NEAR Hunt reads those rows; it does not hold them. That shapes what
          this policy can and cannot do.
        </p>
      </header>

      <div className={s.grid}>
        <section className={s.card}>
          <h2>How a comment works</h2>
          <ul className={s.list}>
            <li>
              A comment is one row: key <code>comment/{'{submission_id}'}/{'{ms}'}</code> in the{' '}
              <code>nearhunt.near</code> namespace, value <code>{'{ "text": "…", "reply_to": "…"? }'}</code>.
            </li>
            <li>The author is the account that signed the write, not a name typed into the text.</li>
            <li>Plain text, up to {MAX_COMMENT_CHARS.toLocaleString('en')} characters. No images, no markup.</li>
            <li>
              A deletion writes <code>null</code> to your own row. The site stops showing it; the earlier text
              stays in public chain history, as with any NEAR transaction.
            </li>
            <li>
              Anyone can read every comment without this website:{' '}
              <code>POST /v0/latest/nearhunt.near</code> with <code>{'{ "key_prefix": "comment/" }'}</code>.
            </li>
          </ul>
        </section>

        <section className={s.card}>
          <h2>What is welcome</h2>
          <ul className={s.list}>
            <li>Questions for the builders, and answers from them.</li>
            <li>Feedback and criticism of a project, including blunt criticism of the idea.</li>
            <li>Corrections, with the evidence you have.</li>
            <li>Disagreement with other commenters, kept to the argument.</li>
          </ul>
        </section>

        <section className={s.card}>
          <h2>What gets hidden</h2>
          <p className={s.note}>NEAR Hunt hides a comment when it is:</p>
          <ul className={s.list}>
            <li>spam: ads, referral links, token promotion, repeated posts;</li>
            <li>harassment, threats, or abuse aimed at a person rather than a project;</li>
            <li>someone else&apos;s personal data, or a private message published without consent;</li>
            <li>impersonation of a builder, a team or NEAR Hunt;</li>
            <li>illegal content, or content that is illegal to host in the operator&apos;s jurisdiction;</li>
            <li>flooding: many near-identical comments that drown a thread.</li>
          </ul>
          <p className={s.note}>
            Disagreement, scepticism, a bad review and an unpopular opinion are not reasons to hide a comment.
            Upvotes and comments are community signals, never official judging.
          </p>
        </section>

        <section className={s.card}>
          <h2>What hiding does — and does not do</h2>
          <ul className={s.list}>
            <li>
              The site keeps a hide list in the repository,{' '}
              <code>data/hidden-comments.json</code>. An entry names one project, one author and one comment
              id. Hiding is a reviewed code change, and removing the entry brings the comment back.
            </li>
            <li>
              An entry cannot hide another author&apos;s comment, even one with the same id: project, author and
              id must all match.
            </li>
            <li>
              NEAR Hunt cannot delete a comment, and does not try. Only the account that wrote a row can
              remove it; NEAR Hunt&apos;s accounts never write under <code>comment/</code>.
            </li>
            <li>
              Replies to a hidden comment stay visible: they are different people&apos;s rows, and hiding one
              comment must not silence them.
            </li>
            <li>Hidden comments are left out of counts and out of the discussion API, and no reason is published.</li>
          </ul>
        </section>

        <section className={s.card}>
          <h2>Report a comment</h2>
          <p className={s.note}>
            Open an issue at{' '}
            <a href={REPORT_URL} rel="noopener noreferrer">github.com/satojandro/near-hunt</a> with the project
            page, the author&apos;s account id and the comment text. Reports are read by the operator; a hide is a
            commit, so it is visible in the repository history.
          </p>
          <p className={s.note}>
            If a comment breaks the law or threatens someone, report it to the platform where you saw it as
            well: NEAR Hunt cannot remove a row from the chain.
          </p>
        </section>

        <section className={s.card}>
          <h2>Your account, your rows</h2>
          <p className={s.note}>
            Comments are signed with the login key you approve when you connect — the same key that signs
            upvotes. It can write only <code>__fastdata_kv</code> calls to <code>nearhunt.near</code>; it cannot
            move funds. Disconnecting does not remove the key from your account; remove it in a NEAR wallet if
            you want it gone.
          </p>
          <p className={s.note}>
            <Link href="/open-data">Open data</Link> explains where every row lives and how to read it directly.
          </p>
        </section>
      </div>
    </main>
  );
}
