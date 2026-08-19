import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Subreddit Vibe Check",
  description:
    "Score the sentiment of any subreddit's hottest posts with VADER.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
