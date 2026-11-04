import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { verifyAdminSession } from '@/server/auth';
import { getTestCatalog } from '@/server/testRepository';
import { AdminDashboard } from '@/components/admin/AdminDashboard';

export const metadata: Metadata = {
  title: 'Bảng Điều Khiển Quản Trị | L TestLab',
  description: 'Quản lý trạng thái hiển thị, tạo mới đề thi và quản lý âm thanh nghe tự động.',
};

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const isAdmin = await verifyAdminSession();
  if (!isAdmin) {
    redirect('/admin/login?redirect=/admin');
  }

  // Load all tests including hidden ones
  const catalog = await getTestCatalog({ includeHidden: true });

  return (
    <main className="max-w-6xl mx-auto p-3 sm:p-6">
      <AdminDashboard initialTests={catalog.tests} />
    </main>
  );
}
