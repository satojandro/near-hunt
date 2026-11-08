// NH-50: account header from the near.social profile API. Everything shown is plain text; the
// avatar is used only when it is an https URL (lib/account.mjs). If near.social is down, or the
// account has no profile, the header still shows the account id with a letter avatar.
import { profileUrl } from '@/lib/social.mjs';
import type { AccountProfile } from '@/lib/account.mjs';
import EditProfileLink from './EditProfileLink';
import s from './account.module.css';

const nf = new Intl.NumberFormat('en-US');

type Props = {
  profile: AccountProfile;
  profileStatus: 'ok' | 'error';
  /** Active upvotes on live projects; null when they could not be read. */
  upvoteCount: number | null;
};

export default function ProfileHeader({ profile, profileStatus, upvoteCount }: Props) {
  const id = profile.account_id;
  const letter = ((profile.name ?? id).match(/[\p{L}\p{N}]/u)?.[0] ?? '?').toUpperCase();
  const stats: Array<{ value: number; label: string }> = [];
  if (upvoteCount !== null) stats.push({ value: upvoteCount, label: upvoteCount === 1 ? 'Upvote' : 'Upvotes' });
  if (profile.followers !== null) stats.push({ value: profile.followers, label: 'near.social followers' });
  if (profile.posts !== null) stats.push({ value: profile.posts, label: 'near.social posts' });

  return (
    <section aria-labelledby="account-name">
      <div className={s.header}>
        {profile.avatar_url ? (
          // Plain <img>: avatars live on many hosts, and next/image would need each one configured.
          <img
            className={s.avatar}
            src={profile.avatar_url}
            alt=""
            width={112}
            height={112}
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className={s.avatar} aria-hidden="true">{letter}</span>
        )}
        <div className={s.headerText}>
          <h1 id="account-name" className={s.name}>{profile.name ?? id}</h1>
          <p className={s.sub}>
            {id}
            {profile.has_profile ? ' · profile from near.social' : ''}
          </p>
          {profile.about ? <p className={s.about}>{profile.about}</p> : null}
          {profileStatus === 'error' ? (
            <p className={s.note} role="status">near.social is not responding, so the profile name and picture are hidden.</p>
          ) : !profile.has_profile ? (
            <p className={s.note}>This account has no near.social profile yet.</p>
          ) : null}
        </div>
        <div className={s.headerActions}>
          <EditProfileLink accountId={id} className={s.editBtn} />
          <a className={s.socialBtn} href={profileUrl(id)} target="_blank" rel="noopener noreferrer">
            View on near.social <span aria-hidden="true">↗</span>
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        </div>
      </div>
      {stats.length > 0 ? (
        <ul className={s.stats}>
          {stats.map((st) => (
            <li key={st.label} className={s.stat}>
              <span className={s.statValue}>{nf.format(st.value)}</span>
              <span className={s.statLabel}>{st.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
