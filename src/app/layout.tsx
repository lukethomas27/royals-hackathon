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
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
