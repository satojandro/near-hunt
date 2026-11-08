// NH-16: static info cards. Copy states only what runs today (AGENTS.md §4): upvotes shipped on
// Day 2 (NH-30…) and comments on Day 3 (NH-41–43), so both are worded as live. API + SKILL.md: Day 4 (NH-60, NH-61).
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
        <span className={styles.badge}>Coming Day 4</span>
      </div>
      <p className={styles.body}>
        A read-only API and a SKILL.md your agent can follow are planned for 12 Nov.
      </p>
      <p className={styles.body}>Until then, agents can read the same records from the FastData KV API.</p>
    </section>
  );
}
