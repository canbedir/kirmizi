import type { Metadata } from "next";
import localFont from "next/font/local";
import { Bricolage_Grotesque } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Display serif — Junicode, subset to Latin + Turkish and shipped locally
// (it isn't on Google Fonts). Its italic carries the one emphasized word.
const junicode = localFont({
  variable: "--font-junicode",
  display: "swap",
  src: [
    { path: "./fonts/Junicode-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Junicode-Italic.woff2", weight: "400", style: "italic" },
  ],
});

// UI / body — Bricolage Grotesque, with latin-ext for Turkish glyphs.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kırmızı — Record your screen. Nothing leaves your browser.",
  description:
    "A privacy-first, no-signup screen recorder that runs entirely in your browser. No account, no upload, no watermark — every frame stays on your machine.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${bricolage.variable} ${GeistMono.variable} ${junicode.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
