import type { Metadata } from 'next';
import './globals.css';
import { NavigationGuardProvider } from '@/components/NavigationGuard';
import { AppHeader } from '@/components/AppHeader';

export const metadata: Metadata = {
  title: 'English Test Lab | Local Testing & Assessment',
  description: 'Nền tảng kiểm tra 4 kỹ năng tiếng Anh với chấm điểm tự động và AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="h-full">
      <body className="min-h-screen bg-white text-black flex flex-col font-sans antialiased">
        <NavigationGuardProvider>
          <AppHeader />
          <div className="flex-1">{children}</div>
          <footer className="border-t-2 border-black py-4 px-6 text-center text-xs text-neutral-600 bg-white">
            <p className="font-mono">
              English Test WebApp &bull; Next.js App Router &bull; Local Only Storage &bull; WCAG High Contrast A11y
            </p>
          </footer>
        </NavigationGuardProvider>
      </body>
    </html>
  );
}
