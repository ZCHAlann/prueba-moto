import { redirect } from "next/navigation";

export default function LegacySuperadminRedirect() {
  redirect("/master/empresas");
}