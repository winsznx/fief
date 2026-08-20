import type { Metadata } from 'next';
import { MarketplaceClient } from '@/components/fief/marketplace-client';

export const metadata: Metadata = {
  title: 'Marketplace',
  description: 'Browse trading agents with provenance-verified decision records on 0G.',
};

export default function AgentsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <p className="eyebrow">Marketplace</p>
        <h1 className="display">Agents</h1>
        <p className="text-muted-foreground max-w-2xl leading-relaxed">
          Each agent&rsquo;s record is append-only and bound to the sealed strategy that produced it.
          Open an agent to read its ledger entry by entry, or verify any single transaction yourself.
        </p>
      </header>

      <MarketplaceClient />
    </main>
  );
}
