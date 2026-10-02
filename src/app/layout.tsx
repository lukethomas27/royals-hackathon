import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArenaPulse - Victoria Royals",
  description: "Find the shortest concession line",
};

// Inline script to prevent flash of wrong theme on load
const themeScript = `
(function(){
  var t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') {
    document.documentElement.setAttribute('data-theme', t);
  }
})();
`;

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {liveSquareInDev() && (
          <div className="live-square-banner" role="alert">
            <strong>LOCAL DEV — LIVE SQUARE</strong>
            <span>Production credentials. Any order placed here is a real order at a real stand.</span>
          </div>
        )}
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
