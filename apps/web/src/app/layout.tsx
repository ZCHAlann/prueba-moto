import type { Metadata } from "next";
import { headers } from "next/headers";
import { AssetCenterProvider } from "@/components/providers/asset-center-provider";
import { AuthProvider } from "@/components/providers/auth-provider";
import { FeedbackProvider } from "@/components/providers/feedback-provider";
import { FleetOpsProvider } from "@/components/providers/fleetops-provider";
import { MotorsProvider } from "@/components/providers/motors-provider";
import { PlatformProvider } from "@/components/providers/platform-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AppChrome } from "@/components/layout/app-chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: "ApliSmart Motors",
  description: "Control de flotas, motores, generadores electricos y operacion diaria para empresas",
  icons: {
    icon: "/branding/favicon-aplismart.png",
    shortcut: "/branding/favicon-aplismart.png",
    apple: "/branding/favicon-aplismart.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const currentPathname = headerStore.get("x-current-pathname") ?? "";

  return (
    <html lang="es" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full font-sans" style={{ backgroundColor: 'var(--color-gray-50)' }}>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('aplismart-motors-panel-theme-v1')||'light';if(t==='dark'){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}`,
          }}
        />
        <ThemeProvider>
          <PlatformProvider>
            <AuthProvider>
              <FleetOpsProvider>
                <MotorsProvider>
                  <AssetCenterProvider>
                    <FeedbackProvider>
                      <AppChrome initialPathname={currentPathname}>{children}</AppChrome>
                    </FeedbackProvider>
                  </AssetCenterProvider>
                </MotorsProvider>
              </FleetOpsProvider>
            </AuthProvider>
          </PlatformProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}