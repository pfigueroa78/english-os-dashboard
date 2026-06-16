import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
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
          <a
            href="/coach"
            className="fixed bottom-4 right-4 z-50 rounded-full bg-sky-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-2xl shadow-black/40 hover:bg-sky-300"
          >
            Open Coach
          </a>
        </body>
      </html>
    </ClerkProvider>
  );
}
