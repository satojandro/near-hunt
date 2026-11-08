// Directory sidebar: NH-15 ("Live on near.social") and NH-16 (info cards).
// Fluid width; the directory page decides where the aside sits (beside the list, or below it on mobile).
import LiveOnSocial from './LiveOnSocial';
import { BuiltForAgents, HowItWorks } from './InfoCards';
import styles from './sidebar.module.css';

export default async function Sidebar() {
  return (
    <div className={styles.stack}>
      <LiveOnSocial />
      <HowItWorks />
      <BuiltForAgents />
    </div>
  );
}
