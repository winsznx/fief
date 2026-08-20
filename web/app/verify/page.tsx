import type { Metadata } from 'next';
import { VerifyClient } from '@/components/fief/verify-client';

export const metadata: Metadata = {
  title: 'Verify',
  description:
    'Paste a 0G transaction hash and see each on-chain provenance check individually. No wallet required.',
};

export default async function VerifyPage({ searchParams }: PageProps<'/verify'>) {
  const params = await searchParams;
  const raw = params.tx;
  const initial = typeof raw === 'string' ? raw : '';

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <p className="eyebrow">Independent check</p>
        <h1 className="display">Verify a transaction</h1>
        <p className="text-muted-foreground leading-relaxed">
          Every check the contract performs, shown one by one. This page is read-only and takes no
          keys — the same result is reproducible from the command line.
        </p>
      </header>

      <VerifyClient initialTxHash={initial} />
    </main>
  );
}
