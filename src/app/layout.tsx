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
      <body className="min-h-screen bg-[#fcf8ed] text-black flex flex-col font-sans antialiased selection:bg-black selection:text-[#fffdf5]">
        <NavigationGuardProvider>
          <AppHeader />
          <div className="flex-1">{children}</div>
          <footer className="border-t-2 border-black py-4 px-6 text-center text-xs font-semibold text-black bg-[#f4eed9]">
            <p className="font-mono">
              English Test WebApp &bull; Nền vàng giảm ánh sáng xanh &bull; WCAG AAA High Contrast A11y &bull; Local Storage Only
            </p>
          </footer>
        </NavigationGuardProvider>
      </body>
    </html>
  );
}
