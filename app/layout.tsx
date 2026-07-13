import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resume Interview Coach",
  description: "Personalised interview practice from the experience on your resume.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
