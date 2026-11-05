'use client';

import React, { useEffect, useReducer, useRef, useCallback } from 'react';
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
  Upload,
  RotateCcw,
  Square,
} from 'lucide-react';
import type { TtsJobProgress } from '@/server/ttsService';
import type { TestAudioAssetMetadata } from '@/types/test';

interface ListeningPartSummary {
  id: string;
  index: number;
  title: string;
  audioUrl: string | null;
  hasTranscript: boolean;
  scenario: string | null;
  accent: string | null;
  pacing: string | null;
}

interface TtsProgressModalProps {
  testId: string;
  testTitle?: string;
  onClose: () => void;
  onFinished?: () => void;
}

interface ActionMessage {
  type: 'success' | 'error';
  text: string;
}

interface TtsModalState {
  job: TtsJobProgress | null;
  audioMetadata: TestAudioAssetMetadata[];
  listeningParts: ListeningPartSummary[];
  fetchError: string | null;
  actionMessage: ActionMessage | null;
  uploadingPartId: string | null;
  regeneratingPartId: string | null;
  isForceRunningAll: boolean;
  isStopping: boolean;
}

type TtsModalAction =
  | {
    type: 'FETCH_SUCCESS';
    job: TtsJobProgress | null;
    audioMetadata?: TestAudioAssetMetadata[];
    listeningParts?: ListeningPartSummary[];
  }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'SET_ACTION_MESSAGE'; message: ActionMessage | null }
  | { type: 'START_TTS'; partId?: string; force?: boolean }
  | { type: 'STOP_TTS_INDICATORS' }
  | { type: 'START_STOPPING' }
  | { type: 'FINISH_STOPPING' }
  | { type: 'START_UPLOAD'; partId: string }
  | { type: 'FINISH_UPLOAD'; message?: ActionMessage };

function ttsModalReducer(state: TtsModalState, action: TtsModalAction): TtsModalState {
  switch (action.type) {
    case 'FETCH_SUCCESS':
      return {
        ...state,
        job: action.job,
        audioMetadata: action.audioMetadata ?? state.audioMetadata,
        listeningParts: action.listeningParts ?? state.listeningParts,
        fetchError: null,
      };

    case 'FETCH_ERROR':
      return {
        ...state,
        fetchError: action.error,
      };

    case 'SET_ACTION_MESSAGE':
      return {
        ...state,
        actionMessage: action.message,
      };

    case 'START_TTS':
      return {
        ...state,
        actionMessage: null,
        regeneratingPartId: action.partId ?? null,
        isForceRunningAll: Boolean(action.force && !action.partId),
      };

    case 'STOP_TTS_INDICATORS':
      return {
        ...state,
        regeneratingPartId: null,
        isForceRunningAll: false,
      };

    case 'START_STOPPING':
      return {
        ...state,
        isStopping: true,
      };

    case 'FINISH_STOPPING':
      return {
        ...state,
        isStopping: false,
      };

    case 'START_UPLOAD':
      return {
        ...state,
        uploadingPartId: action.partId,
        actionMessage: null,
      };

    case 'FINISH_UPLOAD':
      return {
        ...state,
        uploadingPartId: null,
        actionMessage: action.message ?? state.actionMessage,
      };

    default:
      return state;
  }
}

const initialTtsModalState: TtsModalState = {
  job: null,
  audioMetadata: [],
  listeningParts: [],
  fetchError: null,
  actionMessage: null,
  uploadingPartId: null,
  regeneratingPartId: null,
  isForceRunningAll: false,
  isStopping: false,
};

export const TtsProgressModal: React.FC<TtsProgressModalProps> = ({
  testId,
  testTitle,
  onClose,
  onFinished,
}) => {
  const [state, dispatch] = useReducer(ttsModalReducer, initialTtsModalState);
  const {
    job,
    audioMetadata,
    listeningParts,
    fetchError,
    actionMessage,
    uploadingPartId,
    regeneratingPartId,
    isForceRunningAll,
    isStopping,
  } = state;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetUploadPartRef = useRef<string | null>(null);

  const fetchStatus = useCallback(
    async (withMeta = false) => {
      try {
        const url = `/api/admin/generate-tts?testId=${encodeURIComponent(testId)}${withMeta ? '&includeAudioMeta=true' : ''
          }`;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Không thể lấy trạng thái tiến trình.');
        }

        dispatch({
          type: 'FETCH_SUCCESS',
          job: data.job || null,
          audioMetadata: Array.isArray(data.audioMetadata) ? data.audioMetadata : undefined,
          listeningParts: Array.isArray(data.listeningParts) ? data.listeningParts : undefined,
        });
        return data.job as TtsJobProgress | null;
      } catch (err) {
        dispatch({
          type: 'FETCH_ERROR',
          error: err instanceof Error ? err.message : 'Lỗi kết nối.',
        });
        return null;
      }
    },
    [testId]
  );

  const jobRef = useRef<TtsJobProgress | null>(job);

  useEffect(() => {
    jobRef.current = job;
  }, [job]);

  // Poll progress every 1200ms while running
  useEffect(() => {
    let isMounted = true;
    let timer: NodeJS.Timeout | null = null;

    const poll = async (firstLoad = false) => {
      const activeJob = jobRef.current;
      const currentJob = await fetchStatus(
        firstLoad || !activeJob || activeJob.status !== 'processing'
      );
      if (!isMounted) return;

      if (currentJob && currentJob.status === 'processing') {
        timer = setTimeout(() => poll(false), 2000);
      } else {
        dispatch({ type: 'STOP_TTS_INDICATORS' });
        if (currentJob && (currentJob.status === 'completed' || currentJob.status === 'failed')) {
          await fetchStatus(true);
          if (onFinished) {
            onFinished();
          }
        }
      }
    };

    poll(true);

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [testId, fetchStatus, onFinished]);

  const handleTriggerTts = async (options?: { force?: boolean; partId?: string }) => {
    dispatch({ type: 'START_TTS', partId: options?.partId, force: options?.force });

    try {
      const res = await fetch('/api/admin/generate-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testId,
          background: true,
          force: Boolean(options?.force),
          partId: options?.partId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể khởi chạy TTS.');
      }
      if (data.job) {
        dispatch({ type: 'FETCH_SUCCESS', job: data.job });
      }
      // Restart polling loop
      setTimeout(() => {
        void fetchStatus(true);
      }, 600);
    } catch (err) {
      dispatch({ type: 'STOP_TTS_INDICATORS' });
      dispatch({
        type: 'SET_ACTION_MESSAGE',
        message: {
          type: 'error',
          text: err instanceof Error ? err.message : 'Lỗi khi chạy TTS.',
        },
      });
    }
  };

  const handleRequestSafeStop = async () => {
    dispatch({ type: 'START_STOPPING' });

    try {
      const res = await fetch('/api/admin/generate-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testId,
          action: 'stop',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể gửi tín hiệu dừng.');
      }
      dispatch({
        type: 'SET_ACTION_MESSAGE',
        message: {
          type: 'success',
          text: 'Đã gửi tín hiệu dừng an toàn: không cấp phát thêm key mới. Các request đang chạy sẽ tiếp tục cho đến khi hoàn thành.',
        },
      });
      if (data.job) {
        dispatch({ type: 'FETCH_SUCCESS', job: data.job });
      }
      void fetchStatus(true);
    } catch (err) {
      dispatch({
        type: 'SET_ACTION_MESSAGE',
        message: {
          type: 'error',
          text: err instanceof Error ? err.message : 'Lỗi khi gửi tín hiệu dừng.',
        },
      });
    } finally {
      dispatch({ type: 'FINISH_STOPPING' });
    }
  };

  const handleOpenManualUpload = (partId: string) => {
    targetUploadPartRef.current = partId;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const partId = targetUploadPartRef.current;
    e.target.value = '';
    if (!file || !partId) return;

    dispatch({ type: 'START_UPLOAD', partId });

    try {
      const formData = new FormData();
      formData.append('testId', testId);
      formData.append('partId', partId);
      formData.append('file', file);

      const res = await fetch('/api/admin/generate-tts', {
        method: 'PUT',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Tải file audio thất bại.');
      }

      dispatch({
        type: 'FINISH_UPLOAD',
        message: {
          type: 'success',
          text: `Đã tải lên thành công audio cho phần "${partId}" (${(
            (data.byteLength || 0) / 1024
          ).toFixed(0)} KB).`,
        },
      });
      await fetchStatus(true);
      if (onFinished) onFinished();
    } catch (err) {
      dispatch({
        type: 'FINISH_UPLOAD',
        message: {
          type: 'error',
          text: err instanceof Error ? err.message : 'Không thể tải file audio lên.',
        },
      });
    }
  };

  const percent = job?.percent ?? 0;
  const isRunning = job?.status === 'processing';
  const isCompleted = job?.status === 'completed';
  const isFailed = job?.status === 'failed';

  const audioMetaMap = new Map(audioMetadata.map((m) => [m.partId, m]));
  const jobPartMap = new Map((job?.parts || []).map((p) => [p.id, p]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-3xl border-3 border-black bg-[#fffdf5] shadow-[8px_8px_0px_0px_#000] p-4 sm:p-6 flex flex-col max-h-[92vh]">
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,audio/mpeg,audio/wav"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-black shrink-0" />
              <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-black truncate">
                Quản Lý Audio & TTS
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

          {actionMessage && (
            <div
              className={`p-3 border-2 text-xs font-medium flex items-center justify-between gap-2 ${actionMessage.type === 'success'
                ? 'bg-[#e6f4ea] border-[#137333] text-[#137333]'
                : 'bg-red-100 border-red-600 text-red-900'
                }`}
            >
              <div className="flex items-center gap-2">
                {actionMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{actionMessage.text}</span>
              </div>
              <button
                type="button"
                onClick={() => dispatch({ type: 'SET_ACTION_MESSAGE', message: null })}
                className="p-0.5 hover:opacity-70 transition-opacity cursor-pointer shrink-0"
                title="Đóng thông báo"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Progress Bar & Status */}
          <div className="border-2 border-black bg-white p-3.5 space-y-2.5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
              <div className="flex items-center gap-2">
                {isRunning ? (
                  job?.stopRequested || job?.currentMessage?.includes('STOP_REQUESTED') || isStopping ? (
                    <span className="inline-flex items-center gap-1.5 text-amber-800 font-black">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0 text-amber-700" />
                      <span>ĐANG DỪNG AN TOÀN...</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-blue-700 font-black">
                      <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                      <span>ĐANG TẠO AUDIO & TẢI LÊN...</span>
                    </span>
                  )
                ) : isCompleted ? (
                  <span className="inline-flex items-center gap-1.5 text-[#137333] font-black">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>ĐỒNG BỘ HOÀN TẤT</span>
                  </span>
                ) : isFailed ? (
                  <span className="inline-flex items-center gap-1.5 text-red-700 font-black">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>CÓ LỖI XẢY RA</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-neutral-600 font-black">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span>SẴN SÀNG</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-black">
                  {percent}%{' '}
                  <span className="text-xs text-neutral-500 font-normal">
                    ({job ? `${job.completed}/${job.total}` : `${audioMetadata.length}/${listeningParts.length}`} phần)
                  </span>
                </span>

                {isRunning && (
                  <button
                    type="button"
                    onClick={handleRequestSafeStop}
                    disabled={isStopping || job?.stopRequested || job?.currentMessage?.includes('STOP_REQUESTED')}
                    className="border-2 border-red-700 bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                    title="Dừng an toàn: Không cấp phát thêm key mới. Các request đang chạy sẽ tiếp tục cho đến khi hoàn thành, nếu gặp lỗi sẽ chấp nhận fail ngay."
                  >
                    {isStopping || job?.stopRequested || job?.currentMessage?.includes('STOP_REQUESTED') ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Square className="w-3 h-3 fill-current" />
                    )}
                    <span>
                      {isStopping || job?.stopRequested || job?.currentMessage?.includes('STOP_REQUESTED')
                        ? 'Đang dừng...'
                        : 'Dừng an toàn'}
                    </span>
                  </button>
                )}

                {!isRunning && listeningParts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleTriggerTts({ force: true })}
                    disabled={isForceRunningAll}
                    className="border border-black bg-[#f4eed9] hover:bg-black hover:text-[#fffdf5] text-black px-2 py-1 text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
                    title="Tạo lại toàn bộ audio cho các phần nghe bằng Gemini TTS"
                  >
                    {isForceRunningAll ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                        <span>Đang khởi tạo...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-3 h-3 shrink-0" />
                        <span>Tạo lại toàn bộ</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full bg-neutral-200 border-2 border-black h-4 overflow-hidden relative">
              <div
                className={`h-full transition-all duration-300 ${isCompleted
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
              {job?.currentMessage ||
                (isRunning
                  ? 'Đang chuẩn bị các phần nghe...'
                  : 'Bạn có thể tạo TTS tự động hoặc tải file MP3/WAV thủ công cho từng phần bên dưới.')}
            </p>
          </div>

          {/* Parts & Audio Metadata Table */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-black mb-2 flex items-center justify-between">
              <span>
                Danh Sách Phần Nghe & Metadata ({listeningParts.length || job?.parts?.length || 0})
              </span>
              {isRunning && (
                <span className="text-[11px] font-normal text-blue-700 flex items-center gap-1 font-mono">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Đang đồng bộ trực tiếp...
                </span>
              )}
            </h3>

            <div className="border-2 border-black bg-white divide-y-2 divide-black max-h-80 overflow-y-auto">
              {listeningParts.length === 0 && (!job || job.parts.length === 0) ? (
                <div className="p-4 text-center text-xs text-neutral-500">
                  {isRunning ? 'Đang nạp danh sách các phần nghe...' : 'Không có phần nghe nào.'}
                </div>
              ) : (
                (listeningParts.length > 0
                  ? listeningParts
                  : (job?.parts || []).map((jp, idx) => ({
                    id: jp.id,
                    index: idx,
                    title: jp.title,
                    audioUrl: jp.webUrl || null,
                    hasTranscript: true,
                    scenario: null,
                    accent: null,
                    pacing: null,
                  }))
                ).map((part) => {
                  const jp = jobPartMap.get(part.id);
                  const meta = audioMetaMap.get(part.id);
                  const effectiveUrl = meta?.publicUrl || jp?.webUrl || part.audioUrl;
                  const status =
                    regeneratingPartId === part.id
                      ? 'processing'
                      : jp?.status || (effectiveUrl ? 'completed' : 'pending');
                  const isUploadingThis = uploadingPartId === part.id;

                  return (
                    <div
                      key={part.id}
                      className={`p-3 flex flex-col gap-2 text-xs ${status === 'processing'
                        ? 'bg-blue-50/70'
                        : status === 'completed'
                          ? 'bg-[#e6f4ea]/30'
                          : status === 'failed'
                            ? 'bg-red-50'
                            : 'bg-white'
                        }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {status === 'completed' ? (
                            <CheckCircle2 className="w-4 h-4 text-[#137333] shrink-0" />
                          ) : status === 'skipped' ? (
                            <FastForward className="w-4 h-4 text-[#137333] shrink-0" />
                          ) : status === 'processing' ? (
                            <Loader2 className="w-4 h-4 text-blue-700 animate-spin shrink-0" />
                          ) : status === 'failed' ? (
                            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                          ) : (
                            <Clock className="w-4 h-4 text-neutral-400 shrink-0" />
                          )}

                          <span className="font-mono text-[11px] font-bold bg-black text-[#fffdf5] px-1.5 py-0.2">
                            {part.id}
                          </span>
                          <span className="font-bold text-black truncate">
                            {part.title}
                          </span>
                        </div>

                        {/* Action Buttons per Part */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {part.hasTranscript && (
                            <button
                              type="button"
                              disabled={isRunning || isUploadingThis || regeneratingPartId !== null}
                              onClick={() =>
                                handleTriggerTts({ force: true, partId: part.id })
                              }
                              className={`border border-black font-bold px-2 py-0.5 text-[11px] inline-flex items-center justify-center min-w-19 gap-1 transition-colors ${regeneratingPartId === part.id
                                  ? 'bg-blue-600 text-white cursor-wait'
                                  : 'bg-[#fffdf5] hover:bg-black hover:text-[#fffdf5] text-black cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
                                }`}
                              title="Tạo lại audio cho phần nghe này bằng Gemini TTS"
                            >
                              {regeneratingPartId === part.id ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                                  <span>Đang tạo...</span>
                                </>
                              ) : (
                                <>
                                  <RotateCcw className="w-3 h-3 shrink-0" />
                                  <span>Tạo TTS</span>
                                </>
                              )}
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isRunning || isUploadingThis || regeneratingPartId !== null}
                            onClick={() => handleOpenManualUpload(part.id)}
                            className={`border border-black font-bold px-2 py-0.5 text-[11px] inline-flex items-center justify-center min-w-22 gap-1 transition-colors ${isUploadingThis
                                ? 'bg-amber-500 text-black cursor-wait'
                                : 'bg-[#f4eed9] hover:bg-black hover:text-[#fffdf5] text-black cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
                              }`}
                            title="Tải file MP3/WAV từ máy tính"
                          >
                            {isUploadingThis ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                                <span>Đang tải...</span>
                              </>
                            ) : (
                              <>
                                <Upload className="w-3 h-3 shrink-0" />
                                <span>Upload MP3</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Metadata Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-neutral-600">
                        {meta ? (
                          <>
                            <span className="bg-neutral-100 border border-neutral-300 px-1.5 py-0.2 text-black font-semibold">
                              {(meta.fileSizeBytes / 1024).toFixed(0)} KB ({meta.format.toUpperCase()})
                            </span>
                            {meta.durationSeconds && (
                              <span className="bg-neutral-100 border border-neutral-300 px-1.5 py-0.2">
                                ~{meta.durationSeconds}s
                              </span>
                            )}
                            <span className="bg-neutral-100 border border-neutral-300 px-1.5 py-0.2">
                              {meta.languageCode}
                            </span>
                            {meta.scenario && (
                              <span className="bg-neutral-100 border border-neutral-300 px-1.5 py-0.2">
                                {meta.scenario}
                              </span>
                            )}
                            {meta.speakers?.length > 0 && (
                              <span className="bg-neutral-100 border border-neutral-300 px-1.5 py-0.2">
                                Giọng: {meta.speakers.map((s) => `${s.name}(${s.voiceName})`).join(', ')}
                              </span>
                            )}
                          </>
                        ) : jp?.byteLength ? (
                          <span className="bg-neutral-100 border border-neutral-300 px-1.5 py-0.2 text-black font-semibold">
                            {(jp.byteLength / 1024).toFixed(0)} KB (MP3)
                          </span>
                        ) : (
                          <span className="text-neutral-400 italic">
                            Chưa có metadata audio
                          </span>
                        )}
                      </div>

                      {/* Inline Audio Preview */}
                      {effectiveUrl && (
                        <div className="pt-1">
                          <audio
                            controls
                            preload="none"
                            src={effectiveUrl}
                            className="w-full h-8"
                          />
                        </div>
                      )}

                      {jp?.error && (
                        <p className="text-[11px] text-red-700 font-mono">
                          Lỗi: {jp.error}
                        </p>
                      )}
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
              ? 'Tiến trình đang chạy ngầm và đồng bộ trực tiếp'
              : 'Mọi thay đổi audio được lưu trực tiếp'}
          </p>

          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
            <Link
              href={`/test/${encodeURIComponent(testId)}`}
              target="_blank"
              className="border-2 border-black bg-white hover:bg-neutral-100 text-black font-bold px-3 py-1.5 flex items-center gap-1.5 transition-colors"
            >
              <span>Xem đề thi</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>

            <button
              type="button"
              onClick={onClose}
              className="border-2 border-black bg-black text-[#fffdf5] hover:bg-[#222] font-bold px-4 py-1.5 transition-transform active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
            >
              {isRunning ? 'Ẩn cửa sổ này' : 'Đóng lại'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
