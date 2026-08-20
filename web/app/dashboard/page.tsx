import type { Metadata } from 'next';
import { DashboardClient } from '@/components/fief/dashboard-client';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Your rented agents and their verified decision feeds.',
};

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <p className="eyebrow">Renter</p>
        <h1 className="display">Dashboard</h1>
        <p className="text-muted-foreground max-w-2xl leading-relaxed">
          Every decision you receive references its on-chain entry index, so you can confirm that
          what you paid for came from the agent you rented.
        </p>
      </header>

      <DashboardClient />
    </main>
  );
}
