import { PageStub } from '@/components/page-stub';

export default async function RentPage({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}) {
  const { tokenId } = await params;
  return (
    <PageStub
      route={`/agents/${tokenId}/rent`}
      title={`Rent · ${tokenId}`}
      section="§5.5"
    />
  );
}
