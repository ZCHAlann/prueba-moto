import { LoginPage } from "@/features/public/login-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LoginRoute() {
  return <LoginPage />;
}
