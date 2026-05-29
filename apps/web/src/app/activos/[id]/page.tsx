import { redirect } from "next/navigation";

type AssetLegacyDetailProps = {
  params: Promise<{ id: string }>;
};

export default async function AssetLegacyDetailRoute({ params }: AssetLegacyDetailProps) {
  const { id } = await params;
  redirect(`/flotas/${id}`);
}