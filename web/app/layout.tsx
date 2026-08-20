import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Footer } from '@/components/fief/footer';
import { MockModeRibbon } from '@/components/fief/mock-mode-ribbon';
import { NetworkGuard } from '@/components/fief/network-guard';
import { TopNav } from '@/components/fief/top-nav';
import { Providers } from './providers';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Fief',
    template: '%s · Fief',
  },
  description:
    'Rent or buy a trading agent whose track record is signed by its own sealed brain.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // `dark` is no longer hardcoded — next-themes owns the class (D7). It
    // injects a blocking script to set it before paint, so there is no FOUC;
    // suppressHydrationWarning covers the class the server cannot know.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Providers>
          <MockModeRibbon />
          <TopNav />
          <NetworkGuard />
          <div className="flex flex-1 flex-col">{children}</div>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
