'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  X,
  Volume2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FastForward,
  Clock,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import type { TtsJobProgress } from '@/server/ttsService';

interface TtsProgressModalProps {
  testId: string;
  testTitle?: string;
  onClose: () => void;
  onFinished?: () => void;
}

export const TtsProgressModal: React.FC<TtsProgressModalProps> = ({
  testId,
  testTitle,
  onClose,
  onFinished,
}) => {
  const [job, setJob] = useState<TtsJobProgress | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Poll progress every 1000ms while running
  useEffect(() => {
    let isMounted = true;
    let timer: NodeJS.Timeout | null = null;

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/admin/generate-tts?testId=${encodeURIComponent(testId)}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Không thể lấy trạng thái tiến trình.');
        }

        if (isMounted) {
          setJob(data.job || null);
          setFetchError(null);

          // If still processing, continue polling
          if (data.job && data.job.status === 'processing') {
            timer = setTimeout(fetchStatus, 1000);
          } else if (data.job && (data.job.status === 'completed' || data.job.status === 'failed')) {
            if (onFinished) {
              onFinished();
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          setFetchError(err instanceof Error ? err.message : 'Lỗi kết nối.');
          // Retry poll after 2s
          timer = setTimeout(fetchStatus, 2000);
        }
      }
    };

    fetchStatus();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [testId, onFinished]);

  const percent = job?.percent ?? 0;
  const isRunning = job?.status === 'processing';
  const isCompleted = job?.status === 'completed';
  const isFailed = job?.status === 'failed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-2xl border-3 border-black bg-[#fffdf5] shadow-[8px_8px_0px_0px_#000] p-4 sm:p-6 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-black shrink-0" />
              <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-black truncate">
                Tiến Trình Tạo Audio TTS
              </h2>
            </div>
            <p className="text-xs font-mono text-neutral-600 mt-0.5 truncate">
              Đề thi: <span className="font-bold text-black">{testId}</span>
              {testTitle && ` - ${testTitle}`}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="border-2 border-black p-1 hover:bg-black hover:text-[#fffdf5] transition-colors cursor-pointer shrink-0"
            title="Đóng cửa sổ (Tiến trình vẫn tiếp tục chạy ngầm)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="py-4 space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
          {fetchError && !job && (
            <div className="p-3 bg-red-100 border-2 border-red-600 text-red-900 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{fetchError}</span>
            </div>
          )}

          {/* Progress Bar & Status */}
          <div className="border-2 border-black bg-white p-3.5 space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold">
              <div className="flex items-center gap-2">
                {isRunning ? (
                  <span className="inline-flex items-center gap-1.5 text-blue-700 font-black">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>ĐANG XỬ LÝ...</span>
                  </span>
                ) : isCompleted ? (
                  <span className="inline-flex items-center gap-1.5 text-[#137333] font-black">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>HOÀN TẤT 100%</span>
                  </span>
                ) : isFailed ? (
                  <span className="inline-flex items-center gap-1.5 text-red-700 font-black">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>CÓ LỖI XẢY RA</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-neutral-500 font-black">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span>ĐANG KHỞI TẠO...</span>
                  </span>
                )}
              </div>

              <div className="font-mono text-sm font-black">
                {percent}%{' '}
                <span className="text-xs text-neutral-500 font-normal">
                  ({job ? `${job.completed}/${job.total}` : '0/0'} phần)
                </span>
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-neutral-200 border-2 border-black h-4 overflow-hidden relative">
              <div
                className={`h-full transition-all duration-300 ${
                  isCompleted
                    ? 'bg-[#137333]'
                    : isFailed
                    ? 'bg-red-600'
                    : 'bg-black'
                }`}
                style={{ width: `${Math.max(percent, isRunning ? 5 : 0)}%` }}
              />
            </div>

            {/* Current Step Message */}
            <p className="text-xs font-medium text-neutral-700 line-clamp-1 italic">
              {job?.currentMessage || (isRunning ? 'Đang chuẩn bị các phần nghe...' : 'Đang tải trạng thái...')}
            </p>
          </div>

          {/* Parts Checklist */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-black mb-2 flex items-center justify-between">
              <span>Danh Sách Các Phần Nghe ({job?.parts?.length || 0})</span>
              {isRunning && (
                <span className="text-[11px] font-normal text-blue-700 flex items-center gap-1 font-mono">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Đang cập nhật trực tiếp...
                </span>
              )}
            </h3>

            <div className="border-2 border-black bg-white divide-y-2 divide-black max-h-56 overflow-y-auto">
              {!job || job.parts.length === 0 ? (
                <div className="p-4 text-center text-xs text-neutral-500">
                  {isRunning ? 'Đang nạp danh sách các phần nghe...' : 'Không có phần nghe nào có transcript.'}
                </div>
              ) : (
                job.parts.map((p, idx) => {
                  return (
                    <div
                      key={p.id}
                      className={`p-2.5 flex items-center justify-between gap-3 text-xs ${
                        p.status === 'processing'
                          ? 'bg-blue-50/70 font-semibold'
                          : p.status === 'completed'
                          ? 'bg-[#e6f4ea]/40'
                          : p.status === 'skipped'
                          ? 'bg-neutral-50'
                          : p.status === 'failed'
                          ? 'bg-red-50'
                          : 'bg-white text-neutral-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {p.status === 'completed' ? (
                          <CheckCircle2 className="w-4 h-4 text-[#137333] shrink-0" />
                        ) : p.status === 'skipped' ? (
                          <span title="Đã có sẵn trên đĩa" className="inline-flex">
                            <FastForward className="w-4 h-4 text-neutral-500 shrink-0" />
                          </span>
                        ) : p.status === 'processing' ? (
                          <Loader2 className="w-4 h-4 text-blue-700 animate-spin shrink-0" />
                        ) : p.status === 'failed' ? (
                          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 text-neutral-400 shrink-0" />
                        )}

                        <div className="min-w-0">
                          <div className="truncate font-bold text-black flex items-center gap-1.5">
                            <span className="font-mono text-[11px] bg-neutral-200 px-1 py-0.2">
                              {p.id}
                            </span>
                            <span className="truncate">{p.title}</span>
                          </div>
                          {p.error && (
                            <p className="text-[11px] text-red-700 mt-0.5 line-clamp-1 font-mono">
                              Lỗi: {p.error}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        {p.status === 'completed' ? (
                          <span className="text-[11px] font-bold text-[#137333] font-mono">
                            {p.byteLength ? `${(p.byteLength / 1024).toFixed(0)} KB (MP3)` : 'Đã tạo'}
                          </span>
                        ) : p.status === 'skipped' ? (
                          <span className="text-[11px] text-neutral-500 font-medium font-mono">
                            Có sẵn
                          </span>
                        ) : p.status === 'processing' ? (
                          <span className="text-[11px] text-blue-700 font-bold animate-pulse font-mono">
                            Đang tạo...
                          </span>
                        ) : p.status === 'failed' ? (
                          <span className="text-[11px] text-red-700 font-bold font-mono">
                            Thất bại
                          </span>
                        ) : (
                          <span className="text-[11px] text-neutral-400 font-mono">
                            Chờ
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Errors list if any */}
          {job && job.errors.length > 0 && (
            <div className="p-3 bg-red-50 border-2 border-red-600 space-y-1">
              <span className="text-xs font-bold text-red-900 block">
                Chi tiết các phần gặp lỗi ({job.errors.length}):
              </span>
              <ul className="list-disc pl-4 text-[11px] text-red-800 space-y-0.5 font-mono">
                {job.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t-2 border-black pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <p className="text-neutral-500 text-[11px]">
            {isRunning
              ? 'Tiến trình đang chạy ngầm trên server với cơ chế luân chuyển key tức thì. Bạn có thể an tâm đóng cửa sổ này.'
              : isCompleted
              ? 'Đã cập nhật đầy đủ file âm thanh và đường dẫn vào đề thi.'
              : ''}
          </p>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
            {isCompleted && (
              <Link
                href={`/test/${encodeURIComponent(testId)}`}
                target="_blank"
                className="border-2 border-black bg-white hover:bg-neutral-100 text-black font-bold px-3 py-1.5 flex items-center gap-1.5 transition-colors"
              >
                <span>Xem đề thi</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}

            <button
              type="button"
              onClick={onClose}
              className="border-2 border-black bg-black text-[#fffdf5] hover:bg-[#222] font-bold px-4 py-1.5 transition-transform active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
            >
              {isCompleted ? 'Đóng lại' : 'Ẩn cửa sổ này'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
