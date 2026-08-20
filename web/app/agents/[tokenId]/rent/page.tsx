import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RentClient } from '@/components/fief/rent-client';
import { getDataSource } from '@/lib/data/source';

export async function generateMetadata({
  params,
}: PageProps<'/agents/[tokenId]/rent'>): Promise<Metadata> {
  const { tokenId } = await params;
  const agent = await getDataSource().getAgent(tokenId);
  return { title: agent ? `Rent ${agent.name}` : 'Rent' };
}

export default async function RentPage({ params }: PageProps<'/agents/[tokenId]/rent'>) {
  const { tokenId } = await params;
  const agent = await getDataSource().getAgent(tokenId);
  if (!agent) notFound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-3">
        <p className="eyebrow">
          <Link
            href={`/agents/${agent.tokenId}`}
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            {agent.name}
          </Link>{' '}
          · rent
        </p>
        <h1 className="display">Rent {agent.name}</h1>
        <p className="text-muted-foreground leading-relaxed">
          You receive this agent&rsquo;s decisions as they are recorded, each one linked to its
          on-chain entry so you can verify what you paid for. Execution stays with you.
        </p>
      </header>

      <RentClient agent={agent} />
    </main>
  );
}
