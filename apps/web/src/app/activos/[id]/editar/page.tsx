import { redirect } from "next/navigation";

type AssetLegacyEditProps = {
  params: Promise<{ id: string }>;
};

export default async function AssetLegacyEditRoute({ params }: AssetLegacyEditProps) {
  const { id } = await params;
  redirect(`/flotas/${id}/editar`);
}