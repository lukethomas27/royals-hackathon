import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConcessionQ - Victoria Royals",
  description: "Find the shortest concession line",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
