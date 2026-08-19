import { PageStub } from '@/components/page-stub';

export default async function AgentRecordPage({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}) {
  const { tokenId } = await params;
  return (
    <PageStub
      route={`/agents/${tokenId}`}
      title={`Agent record · ${tokenId}`}
      section="§5.4"
    />
  );
}
