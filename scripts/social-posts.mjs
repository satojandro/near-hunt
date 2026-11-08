#!/usr/bin/env node
/**
 * NH-40 dry run: the next batch of near.social root posts NEAR Hunt would publish as
 * `nearhunt.near`, printed for review. THIS SCRIPT NEVER SIGNS OR SENDS ANYTHING, and has no
 * flag that would. Posting is reserved for the operator, after a human approves the exact batch
 * (AGENTS.md §1: "Never post to near.social as nearhunt.near unless … a human has approved the
 * batch").
 *
 *   node scripts/social-posts.mjs                 # next 40 projects without a social_post
 *   node scripts/social-posts.mjs --limit 5       # 1..40
 *   node scripts/social-posts.mjs --start-ms 1794200000000   # fix the post ids (default: now)
 *   node scripts/social-posts.mjs --json          # the plan as JSON (for the operator's tooling)
 *
 * Reads project records from mainnet `nearhunt.near` through lib/kv.mjs (read-only).
 */

import { readProjects, DEFAULT_ACCOUNT } from '../lib/kv.mjs';
import { toListing } from '../lib/listing.mjs';
import { planSocialPosts, MAX_BATCH } from '../lib/social-post.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
if (args.includes('--execute') || args.includes('--yes')) {
  console.error('scripts/social-posts.mjs is dry-run only. Posting as nearhunt.near is done by the operator after approval.');
  process.exit(2);
}

const limit = Number(flag('limit', String(MAX_BATCH)));
const startMs = Number(flag('start-ms', String(Date.now())));
const asJson = args.includes('--json');

const entries = await readProjects({ account: DEFAULT_ACCOUNT, network: 'mainnet' });
const items = toListing(entries);
const plan = planSocialPosts({ items, limit, startMs });

if (asJson) {
  console.log(JSON.stringify(plan, null, 2));
} else {
  console.log('NH-40 near.social root posts — DRY RUN, nothing signed or sent\n');
  console.log(`  signer account   ${plan.account}`);
  console.log(`  receiver         ${plan.receiver} (mainnet near.social, social-kv/1)`);
  console.log(`  method           ${plan.method}, gas ${plan.gas} (1 Ggas), deposit ${plan.deposit}`);
  console.log(`  records read     ${items.length} (${plan.already_posted} already have social_post)`);
  console.log(`  this batch       ${plan.posts.length} posts in ${plan.transactions} transactions (one post each)`);
  console.log(`  total args bytes ${plan.total_bytes}`);
  console.log('  expected result  every receipt fails with CodeDoesNotExist (no contract on `social`); confirm each');
  console.log('                   with GET https://api2.near.social/v1/tx/{hash} -> key status "ok"; never resend\n');
  for (const p of plan.posts) {
    console.log(`— ${p.name} (${p.submission_id}) -> ${p.post_ref}, ${p.bytes} bytes`);
    console.log(`  receiver ${p.tx.receiverId}, args:`);
    console.log(`  ${JSON.stringify(p.tx.actions[0].params.args)}\n`);
  }
  console.log('After each post is confirmed, its reference goes into the record\'s social_post field via');
  console.log('`node scripts/import.mjs --social-posts data/social-posts.json` (dry run first). The overlay would be:');
  console.log(JSON.stringify(plan.overlay, null, 2));
  console.log('\nDRY RUN — nothing signed. Execution is reserved for the operator (Hermes) after a human approves');
  console.log('this exact batch; it needs a key that can sign for nearhunt.near on receiver `social`.');
}
