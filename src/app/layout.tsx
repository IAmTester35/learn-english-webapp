import type { Metadata } from 'next';
import './globals.css';
import { NavigationGuardProvider } from '@/components/NavigationGuard';
import { AppHeader } from '@/components/AppHeader';

export const metadata: Metadata = {
  title: 'L TestLab | Local Testing & Assessment',
  description: 'Nền tảng kiểm tra 4 kỹ năng tiếng Anh với chấm điểm tự động và AI',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="h-full">
      <body className="min-h-screen bg-[#fcf8ed] text-black flex flex-col font-sans antialiased selection:bg-black selection:text-[#fffdf5]">
        <NavigationGuardProvider>
          <AppHeader />
          <div className="flex-1">{children}</div>
        </NavigationGuardProvider>
      </body>
    </html>
  );
}
