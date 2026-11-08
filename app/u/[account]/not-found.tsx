import Link from 'next/link';
import s from '@/app/components/account/account.module.css';

export default function AccountNotFound() {
  return (
    <main className={`container ${s.page}`}>
      <h1 className={s.name}>Account not found</h1>
      <p className={s.sub}>
        This is not a valid NEAR account id. Account ids are lowercase, like alice.near.
      </p>
      <p>
        <Link href="/">Browse all projects</Link>
      </p>
    </main>
  );
}
