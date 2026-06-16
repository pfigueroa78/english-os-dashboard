import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { AppExperienceLayer } from "@/components/AppExperienceLayer";
import { QAExperienceLayer } from "@/components/QAExperienceLayer";
import "./globals.css";

export const metadata: Metadata = {
  title: "English OS Dashboard",
  description: "English OS learner dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          {children}
          <AppExperienceLayer />
          <QAExperienceLayer />
        </body>
      </html>
    </ClerkProvider>
  );
}
