import { Metadata } from 'next';
import { TestAuthoringView } from '@/components/TestAuthoringView';

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
