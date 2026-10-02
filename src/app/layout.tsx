import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

// Arena Night: condensed uppercase for headings, stand names and prices;
// regular Barlow for body copy.
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ArenaPulse - Victoria Royals",
  description: "Find the shortest concession line",
};

/**
 * Local dev points at whatever SQUARE_ACCESS_TOKEN is in .env.local, and that
 * is currently a PRODUCTION token for the live Eventium account. An order
 * placed from localhost is a real order at a real stand, and with payment
 * capture it takes real money. This banner renders only outside a production
 * build, so it can never reach a fan.
 */
function liveSquareInDev(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    Boolean(process.env.SQUARE_ACCESS_TOKEN) &&
    process.env.SQUARE_ENVIRONMENT === "production"
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`} suppressHydrationWarning>
      <body>
        {liveSquareInDev() && (
          <div className="live-square-banner" role="alert">
            <strong>LOCAL DEV — LIVE SQUARE</strong>
            <span>Production credentials. Any order placed here is a real order at a real stand.</span>
          </div>
        )}
        {/* Royals background. Matt's artwork, held under an opaque navy wash
            measured at 0.82 so every text colour clears 4.5:1 even over the
            image's brightest pixel (#00A5E3). Never used behind item photos. */}
        <div className="arena-bg" aria-hidden="true" />
        <div className="arena-bg-wash" aria-hidden="true" />
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
