import { Metadata } from 'next';
import dynamic from 'next/dynamic';

const TestAuthoringView = dynamic(
  () => import('@/components/TestAuthoringView').then((mod) => mod.TestAuthoringView),
  {
    loading: () => (
      <div className="flex items-center justify-center min-h-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-black border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium text-neutral-600">Đang tải trình tạo đề thi...</p>
        </div>
      </div>
    ),
  }
);

export const metadata: Metadata = {
  title: 'Thêm Đề Thi Mới | L TestLab',
  description: 'Giao diện tạo và tải đề thi tiếng Anh 4 kỹ năng chuẩn CEFR vào hệ thống.',
};

export default function CreateTestPage() {
  return (
    <main className="max-w-6xl mx-auto p-3 sm:p-6">
      <TestAuthoringView />
    </main>
  );
}
