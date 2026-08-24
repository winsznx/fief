import type { Metadata } from 'next';
import { ConsoleClient } from '@/components/fief/console-client';

export const metadata: Metadata = {
  title: 'Owner console',
  description:
    'Seal and mint agents, set the operator, publish rental terms, settle accepted entries and grant audit access.',
};

export default function ConsolePage() {
  return (
    <main className="container-page flex flex-col gap-7 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Owner</p>
        <h1 className="display">Console</h1>
        <p className="page-lede max-w-2xl">
          Everything an owner controls: the sealed strategy behind an agent, who may append to its
          record, what it costs to rent, and who may audit the request side of a past entry. None of
          it can rewrite a recorded decision.
        </p>
      </header>

      <ConsoleClient />
    </main>
  );
}
