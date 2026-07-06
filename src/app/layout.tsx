import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arena",
  description: "Points prediction market"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
