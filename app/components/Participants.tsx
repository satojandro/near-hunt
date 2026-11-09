// NH-112: the people strip on the directory — social validation that is checkable.
//
// The number is accounts with a live vote or comment on `nearhunt.near`, each of which is a row the
// person signed from their own wallet. It is not a login count, and the copy says so, because
// signing in writes nothing to the chain and a made-up "N logged in" would be exactly the kind of
// number this project exists to avoid.
import { fetchProfiles, profileUrl, type SocialProfile } from '@/lib/social.mjs';
import type { Participant } from '@/lib/participants';
import JoinLink from './JoinLink';
import s from './participants.module.css';

/** Avatars shown before "+N more". Each one is a near.social profile request. */
const MAX_AVATARS = 10;

function Avatar({ profile }: { profile: SocialProfile }) {
  if (profile.avatar_url) {
    return (
      <img
        className={s.avatar}
        src={profile.avatar_url}
        alt=""
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
    );
  }
  const letter = ((profile.name ?? profile.account_id).match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
  return <span className={`${s.avatar} ${s.avatarLetter}`} aria-hidden="true">{letter}</span>;
}

/** `label` comes from participantsLabel() so the sentence and the count cannot drift apart. */
export default async function Participants({
  people, label,
}: { people: Participant[]; label: string }) {
  const shown = people.slice(0, MAX_AVATARS);
  const more = people.length - shown.length;
  const { status, profiles } = await fetchProfiles(shown.map((p) => p.account_id));

  return (
    <div className={s.strip}>
      <ul className={s.avatars} aria-hidden={status === 'error' ? 'true' : undefined}>
        {profiles.map((p) => (
          <li key={p.account_id}>
            <a
              className={s.avatarLink}
              href={profileUrl(p.account_id)}
              rel="noopener noreferrer"
              title={p.name ? `${p.name} (${p.account_id})` : p.account_id}
            >
              <Avatar profile={p} />
              <span className="visually-hidden">{p.account_id} on near.social</span>
            </a>
          </li>
        ))}
        {more > 0 ? <li className={`${s.avatar} ${s.more}`} aria-hidden="true">+{more}</li> : null}
      </ul>
      <p className={s.text}>
        <strong>{label}</strong>
        {' — '}
        <JoinLink />
      </p>
    </div>
  );
}
