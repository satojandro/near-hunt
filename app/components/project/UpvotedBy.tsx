// NH-22: "Upvoted by" — voters (the vote rows' predecessor_id, NH-33) with their near.social name
// and avatar. Profiles come from api2.near.social with a cache and a short timeout; if near.social
// is down the list still shows, as account ids with initials.
import { fetchProfiles, profileUrl, type SocialProfile } from '@/lib/social.mjs';
import s from './project.module.css';

/** Avatars shown before "+N more". Each one is a profile request, so this is also a fetch cap. */
export const MAX_VOTER_AVATARS = 12;

function Avatar({ profile }: { profile: SocialProfile }) {
  if (profile.avatar_url) {
    return (
      // Plain <img>: avatars live on many hosts, and next/image would need each one configured.
      <img
        className={s.voterAvatar}
        src={profile.avatar_url}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    );
  }
  const letter = ((profile.name ?? profile.account_id).match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
  return <span className={s.voterAvatar} aria-hidden="true">{letter}</span>;
}

export default async function UpvotedBy({ voters, available }: { voters: string[]; available: boolean }) {
  const shown = voters.slice(0, MAX_VOTER_AVATARS);
  const more = voters.length - shown.length;
  const { status, profiles } = shown.length > 0 ? await fetchProfiles(shown) : { status: 'ok' as const, profiles: [] };

  return (
    <section className={s.card} aria-labelledby="upvoted-by-title">
      <h2 id="upvoted-by-title" className={s.cardTitle}>Upvoted by</h2>
      {!available ? (
        <p className={s.voterNote} role="status">Upvotes can’t be read right now. Try again in a minute.</p>
      ) : voters.length === 0 ? (
        <p className={s.voterNote}>No upvotes yet.</p>
      ) : status === 'error' ? (
        // near.social is down: no names or pictures, so show the account ids themselves.
        <>
          <ul className={s.voterIds}>
            {profiles.map((p) => (
              <li key={p.account_id}>
                <a href={profileUrl(p.account_id)} rel="noopener noreferrer">{p.account_id}</a>
              </li>
            ))}
          </ul>
          {more > 0 ? (
            <p className={s.voterNote}>+{more} more NEAR {more === 1 ? 'account' : 'accounts'}</p>
          ) : null}
          <p className={s.voterNote}>near.social is not responding, so profile names and pictures are hidden.</p>
        </>
      ) : (
        <>
          <ul className={s.voters}>
            {profiles.map((p) => {
              const label = p.name ? `${p.name} (${p.account_id})` : p.account_id;
              return (
                <li key={p.account_id}>
                  <a className={s.voterLink} href={profileUrl(p.account_id)} rel="noopener noreferrer" title={label}>
                    <Avatar profile={p} />
                    <span className="visually-hidden">{label} on near.social</span>
                  </a>
                </li>
              );
            })}
          </ul>
          {more > 0 ? (
            <p className={s.voterNote}>+{more} more NEAR {more === 1 ? 'account' : 'accounts'}</p>
          ) : null}
        </>
      )}
    </section>
  );
}
