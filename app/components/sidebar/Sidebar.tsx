// Directory sidebar: NH-15 ("Live on near.social") and NH-16 (info cards).
// Fluid width; the directory page decides where the aside sits (beside the list, or below it on mobile).
// The near.social feed streams in behind a skeleton (NH-80) so a slow api2.near.social never
// holds the project list.
import { Suspense } from 'react';
import LiveOnSocial, { LiveOnSocialSkeleton } from './LiveOnSocial';
import { BuiltForAgents, HowItWorks } from './InfoCards';
import styles from './sidebar.module.css';

export default async function Sidebar() {
  return (
    <div className={styles.stack}>
      <Suspense fallback={<LiveOnSocialSkeleton />}>
        <LiveOnSocial />
      </Suspense>
      <HowItWorks />
      <BuiltForAgents />
    </div>
  );
}
