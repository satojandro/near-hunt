// NH-16: static info cards. Copy states only what runs today (AGENTS.md §4): upvotes shipped on
// Day 2 (NH-30…), comments on Day 3 (NH-41–43) and the read API + SKILL.md on Day 4 (NH-60, NH-61),
// which deployed on 8 Nov — all three are live, so none of this is worded as planned.
import Link from 'next/link';
import styles from './sidebar.module.css';

export function HowItWorks() {
  return (
    <section className={`${styles.card} ${styles.cardDark}`} aria-labelledby="how-it-works-title">
      <h2 className={styles.title} id="how-it-works-title" style={{ marginBottom: 12 }}>How it works on NEAR</h2>
      <ol className={styles.steps}>
        <li><strong>Projects</strong> are open JSON records stored under nearhunt.near (keys project/…). No smart contract.</li>
        <li><strong>Anyone can read them</strong> through the public FastData KV API. No account or API key needed.</li>
        <li><strong>Upvotes and comments</strong> are written from your own NEAR account: one active upvote per account per project, and comments as near.social replies.</li>
      </ol>
      <code className={styles.code}>POST kv.main.fastnear.com/v0/latest/nearhunt.near/nearhunt.near</code>
    </section>
  );
}

export function BuiltForAgents() {
  return (
    <section className={styles.card} aria-labelledby="built-for-agents-title">
      <div className={styles.head} style={{ marginBottom: 6 }}>
        <h2 className={styles.title} id="built-for-agents-title">Built for agents too</h2>
        <span className={styles.badge}>Live</span>
      </div>
      <p className={styles.body}>
        A read-only JSON API and a <code>/SKILL.md</code> your agent can follow are live. Point one at{' '}
        <code>/SKILL.md</code> and ask it to shortlist ten projects worth investigating.
      </p>
      <Link href="/open-data" className={styles.more}>API and open data</Link>
    </section>
  );
}
