'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Eye,
  EyeOff,
  Volume2,
  Plus,
  LogOut,
  ExternalLink,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  FileText
} from 'lucide-react';
import type { TestCatalogItem } from '@/types/test';
import { TtsProgressModal } from './TtsProgressModal';

interface AdminDashboardProps {
  initialTests: TestCatalogItem[];
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ initialTests }) => {
  const router = useRouter();
  const [tests, setTests] = useState<TestCatalogItem[]>(initialTests);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'public' | 'hidden'>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [generatingTtsId, setGeneratingTtsId] = useState<string | null>(null);
  const [activeModalTest, setActiveModalTest] = useState<{ id: string; title?: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleToggle = async (testId: string) => {
    setTogglingId(testId);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/admin/tests/${encodeURIComponent(testId)}/toggle`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Không thể đổi trạng thái bài thi.');
      }

      setTests((prev) =>
        prev.map((t) => (t.id === testId ? { ...t, hidden: data.hidden } : t))
      );

      setStatusMessage({
        type: 'success',
        text: `Đã ${data.hidden ? 'ẨN' : 'CÔNG KHAI'} bài thi "${testId}".`,
      });
      router.refresh();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi cập nhật trạng thái.',
      });
    } finally {
      setTogglingId(null);
    }
  };

  const handleGenerateTts = async (testId: string, testTitle?: string) => {
    setActiveModalTest({ id: testId, title: testTitle });
    setGeneratingTtsId(testId);

    try {
      const res = await fetch('/api/admin/generate-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testId, background: true }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Tạo audio thất bại.');
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi kích hoạt tiến trình TTS.',
      });
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
      router.push('/admin/login');
      router.refresh();
    } catch (err) {
      console.error('Lỗi khi đăng xuất:', err);
    }
  };

  // Filter & Search
  const filteredTests = tests.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterStatus === 'public') return !t.hidden;
    if (filterStatus === 'hidden') return Boolean(t.hidden);
    return true;
  });

  const totalCount = tests.length;
  const hiddenCount = tests.filter((t) => t.hidden).length;
  const publicCount = totalCount - hiddenCount;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="border-2 border-black bg-[#fffdf5] p-4 sm:p-6 shadow-[4px_4px_0px_0px_#000] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-black">
            <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">Quản Lý Đề Thi & Hệ Thống</h1>
          </div>
          <p className="text-xs sm:text-sm text-neutral-600 mt-1 font-medium">
            Kiểm soát quyền hiển thị, tạo mới đề thi và quản lý âm thanh nghe tự động.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/test/create"
            className="border-2 border-black bg-black text-[#fffdf5] hover:bg-[#222] px-3.5 py-2 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-transform active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm đề mới</span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="border-2 border-black bg-white hover:bg-neutral-100 text-black px-3.5 py-2 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Đăng xuất</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="border-2 border-black bg-white p-4 shadow-sm">
          <span className="text-xs font-bold text-neutral-500 uppercase">Tổng số đề thi</span>
          <div className="text-2xl font-black mt-1 font-mono">{totalCount}</div>
        </div>

        <div className="border-2 border-black bg-[#e6f4ea] p-4 shadow-sm text-[#137333]">
          <span className="text-xs font-bold uppercase">Đang công khai</span>
          <div className="text-2xl font-black mt-1 font-mono">{publicCount}</div>
        </div>

        <div className="border-2 border-black bg-[#fef7e0] p-4 shadow-sm text-[#b06000]">
          <span className="text-xs font-bold uppercase">Đang ẩn</span>
          <div className="text-2xl font-black mt-1 font-mono">{hiddenCount}</div>
        </div>
      </div>

      {/* Notifications */}
      {statusMessage && (
        <div
          className={`p-3.5 border-2 flex items-center gap-2 text-sm font-medium ${statusMessage.type === 'success'
              ? 'bg-[#e6f4ea] border-[#137333] text-[#137333]'
              : 'bg-[#fce8e6] border-[#c5221f] text-[#c5221f]'
            }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="border-2 border-black bg-white p-3 sm:p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo mã ID hoặc tiêu đề..."
            className="w-full border-2 border-black bg-white pl-9 pr-3.5 py-1.5 text-xs sm:text-sm font-medium focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setFilterStatus('all')}
            className={`border-2 border-black px-2.5 py-1.5 text-xs font-bold cursor-pointer transition-colors ${filterStatus === 'all' ? 'bg-black text-[#fffdf5]' : 'bg-[#fffdf5] text-black hover:bg-neutral-100'
              }`}
          >
            Tất cả ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('public')}
            className={`border-2 border-black px-2.5 py-1.5 text-xs font-bold cursor-pointer transition-colors ${filterStatus === 'public' ? 'bg-black text-[#fffdf5]' : 'bg-[#fffdf5] text-black hover:bg-neutral-100'
              }`}
          >
            Công khai ({publicCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('hidden')}
            className={`border-2 border-black px-2.5 py-1.5 text-xs font-bold cursor-pointer transition-colors ${filterStatus === 'hidden' ? 'bg-black text-[#fffdf5]' : 'bg-[#fffdf5] text-black hover:bg-neutral-100'
              }`}
          >
            Đang ẩn ({hiddenCount})
          </button>
        </div>
      </div>

      {/* Table / List */}
      <div className="border-2 border-black bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-175">
          <thead>
            <tr className="border-b-2 border-black bg-[#f4eed9] text-black font-black uppercase text-[11px] sm:text-xs tracking-wider">
              <th className="p-3">Mã đề (ID) & Tiêu đề</th>
              <th className="p-3 w-32 text-center">Trạng thái</th>
              <th className="p-3 w-64 text-right">Thao tác Quản trị</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-black">
            {filteredTests.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-8 text-center text-neutral-500 font-medium">
                  Không tìm thấy bài thi nào phù hợp.
                </td>
              </tr>
            ) : (
              filteredTests.map((test) => {
                const isHidden = Boolean(test.hidden);
                const isToggling = togglingId === test.id;
                const isGeneratingTts = generatingTtsId === test.id;

                return (
                  <tr key={test.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="p-3">
                      <div className="flex items-start gap-2.5">
                        <FileText className="w-5 h-5 text-neutral-500 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-black flex items-center gap-2">
                            <span>{test.title}</span>
                          </div>
                          <div className="text-[11px] font-mono text-neutral-500 mt-0.5">
                            ID: <span className="font-semibold text-neutral-700">{test.id}</span> | Tệp: {test.file}
                          </div>
                          <p className="text-xs text-neutral-600 line-clamp-1 mt-1">{test.description}</p>
                        </div>
                      </div>
                    </td>

                    <td className="p-3 text-center align-middle">
                      {isHidden ? (
                        <span className="inline-flex items-center gap-1 border border-[#b06000] bg-[#fef7e0] text-[#b06000] px-2 py-0.5 text-[11px] font-bold rounded-sm">
                          <EyeOff className="w-3 h-3" />
                          <span>Đã ẩn</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 border border-[#137333] bg-[#e6f4ea] text-[#137333] px-2 py-0.5 text-[11px] font-bold rounded-sm">
                          <Eye className="w-3 h-3" />
                          <span>Công khai</span>
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-right align-middle">
                      <div className="inline-flex items-center gap-1.5">
                        {/* Toggle Visibility */}
                        <button
                          type="button"
                          onClick={() => handleToggle(test.id)}
                          disabled={isToggling}
                          className={`border-2 border-black font-bold px-2.5 py-1 text-xs inline-flex items-center gap-1 transition-colors cursor-pointer ${isHidden
                              ? 'bg-[#137333] text-white hover:bg-[#0d5926]'
                              : 'bg-[#fffdf5] text-black hover:bg-neutral-200'
                            }`}
                          title={isHidden ? 'Mở hiển thị công khai bài này' : 'Ẩn bài thi này khỏi thí sinh'}
                        >
                          {isToggling ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isHidden ? (
                            <>
                              <Eye className="w-3.5 h-3.5" />
                              <span>Hiện</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5" />
                              <span>Ẩn</span>
                            </>
                          )}
                        </button>

                        {/* Trigger TTS */}
                        <button
                          type="button"
                          onClick={() => handleGenerateTts(test.id, test.title)}
                          disabled={isGeneratingTts && activeModalTest?.id === test.id}
                          className="border-2 border-black bg-[#fffdf5] hover:bg-neutral-200 text-black font-bold px-2.5 py-1 text-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
                          title="Tạo mới hoặc kiểm tra audio MP3 cho phần nghe (Xem tiến trình trực quan)"
                        >
                          {isGeneratingTts && activeModalTest?.id === test.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
                          )}
                          <span>TTS</span>
                        </button>

                        {/* Preview / View Link */}
                        <Link
                          href={`/test/${encodeURIComponent(test.id)}`}
                          target="_blank"
                          className="border-2 border-black bg-white hover:bg-neutral-100 text-black font-bold px-2 py-1 text-xs inline-flex items-center gap-1 transition-colors"
                          title="Xem bài thi trực tiếp"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Visual Live TTS Progress Modal */}
      {activeModalTest && (
        <TtsProgressModal
          testId={activeModalTest.id}
          testTitle={activeModalTest.title}
          onClose={() => setActiveModalTest(null)}
          onFinished={() => {
            setGeneratingTtsId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
};
