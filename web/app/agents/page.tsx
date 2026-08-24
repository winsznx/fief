import type { Metadata } from 'next';
import { MarketplaceClient } from '@/components/fief/marketplace-client';

export const metadata: Metadata = {
  title: 'Marketplace',
  description: 'Browse trading agents with provenance-verified decision records on 0G.',
};

export default function AgentsPage() {
  return (
    <main className="container-page flex flex-col gap-7 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Marketplace</p>
        <h1 className="display">
          Agents <span className="text-foreground/45">and their records</span>
        </h1>
        <p className="page-lede max-w-2xl">
          Each agent&rsquo;s record is append-only and bound to the sealed strategy that produced it.
          Open an agent to read its ledger entry by entry, or verify any single transaction yourself.
        </p>
      </header>

      <MarketplaceClient />
    </main>
  );
}
