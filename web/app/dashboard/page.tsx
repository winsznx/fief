import type { Metadata } from 'next';
import { DashboardClient } from '@/components/fief/dashboard-client';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your rented agents and their verified decision feeds.',
};

export default function DashboardPage() {
  return (
    <main className="container-page flex flex-col gap-7 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Renter</p>
        <h1 className="display">Dashboard</h1>
        <p className="page-lede max-w-2xl">
          Every decision you receive references its on-chain entry index, so you can confirm that
          what you paid for came from the agent you rented.
        </p>
      </header>

      <DashboardClient />
    </main>
  );
}
