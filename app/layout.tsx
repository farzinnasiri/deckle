import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { BrowserErasureGuard } from "@/components/browser-erasure-guard";
import "./globals.css";
import "./motion.css";
import "./paper-tools.css";
import "./ghostwriter.css";
import "./mobile-workspace.css";
export const metadata: Metadata = {
  title: "Deckle — a place for your words",
  description:
    "A quiet writing machine. One strip of paper. Your words, at your own pace.",
  applicationName: "Deckle",
  appleWebApp: {
    capable: true,
    title: "Deckle",
    statusBarStyle: "default",
  },
};
export const viewport: Viewport = {
  themeColor: "#353a34",
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
          appearance={{
            variables: {
              colorPrimary: "#353a34",
              colorBackground: "#f5efdf",
              colorForeground: "#353a34",
              colorMutedForeground: "#746c5b",
              fontFamily: 'Barlow, "Helvetica Neue", Arial, sans-serif',
              borderRadius: "0.25rem",
            },
            elements: {
              cardBox: "auth-card-box",
              card: "auth-card",
              footer: "auth-footer",
              headerSubtitle: { display: "none" },
              lastAuthenticationStrategyBadge: { display: "none" },
              headerTitle: { fontSize: "22px" },
              socialButtonsBlockButton: { minHeight: "44px" },
              socialButtonsProviderIcon: { flexShrink: 0 },
            },
          }}
        >
          <BrowserErasureGuard>{children}</BrowserErasureGuard>
        </ClerkProvider>
      </body>
    </html>
  );
}
