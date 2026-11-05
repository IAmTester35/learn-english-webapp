'use client';

import React, { useState, useCallback, useEffect } from 'react';
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
  FileText,
  Edit3,
  Trash2,
  Key,
  RefreshCw,
  Activity,
  X,
} from 'lucide-react';
import type { TestCatalogItem } from '@/types/test';
import type { GeminiKeyPublicInfo } from '@/server/geminiKeyManager';
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [generatingTtsId, setGeneratingTtsId] = useState<string | null>(null);
  const [activeModalTest, setActiveModalTest] = useState<{ id: string; title?: string } | null>(
    null
  );
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Gemini API Key Pool state
  const [showKeyManager, setShowKeyManager] = useState(false);
  const [geminiKeys, setGeminiKeys] = useState<GeminiKeyPublicInfo[]>([]);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [isProbingKeys, setIsProbingKeys] = useState(false);
  const [isResettingCooldowns, setIsResettingCooldowns] = useState(false);
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);
  const [newKeyInput, setNewKeyInput] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [isAddingKey, setIsAddingKey] = useState(false);

  // Global & Action states
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  // Auto-dismiss success notification
  useEffect(() => {
    if (statusMessage?.type === 'success') {
      const timer = setTimeout(() => {
        setStatusMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  const reloadTestsCatalog = useCallback(async () => {
    try {
      const res = await fetch('/api/tests?admin=true');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.tests)) {
          setTests(data.tests);
        }
      }
    } catch {
      // ignore reload error
    }
  }, []);

  const handleManualReload = async () => {
    setIsReloading(true);
    try {
      await reloadTestsCatalog();
      router.refresh();
      setStatusMessage({
        type: 'success',
        text: 'Đã làm mới dữ liệu danh sách bài thi thành công.',
      });
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Không thể làm mới danh sách bài thi.',
      });
    } finally {
      setIsReloading(false);
    }
  };

  const loadGeminiKeys = useCallback(async () => {
    setIsLoadingKeys(true);
    try {
      const res = await fetch('/api/admin/gemini-keys');
      const data = await res.json();
      if (res.ok && Array.isArray(data.keys)) {
        setGeminiKeys(data.keys);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingKeys(false);
    }
  }, []);

  const handleToggleKeyManager = () => {
    const next = !showKeyManager;
    setShowKeyManager(next);
    if (next && geminiKeys.length === 0) {
      void loadGeminiKeys();
    }
  };

  const handleToggle = async (testId: string) => {
    if (togglingId || deletingId) return;
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

  const handleDeleteTest = async (testId: string, testTitle: string) => {
    if (deletingId || togglingId) return;
    if (
      !window.confirm(
        `Bạn có chắc chắn muốn XÓA VĨNH VIỄN đề thi "${testTitle}" (${testId}) và toàn bộ file audio của đề này?`
      )
    ) {
      return;
    }

    setDeletingId(testId);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/tests?id=${encodeURIComponent(testId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể xóa đề thi.');
      }

      setTests((prev) => prev.filter((t) => t.id !== testId));
      setStatusMessage({
        type: 'success',
        text: `Đã xóa đề thi "${testId}" và toàn bộ audio liên quan.`,
      });
      router.refresh();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi xóa đề thi.',
      });
    } finally {
      setDeletingId(null);
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

  const handleAddGeminiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyInput.trim()) return;
    setIsAddingKey(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/admin/gemini-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          apiKey: newKeyInput.trim(),
          label: newKeyLabel.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Không thể thêm Gemini API Key.');
      }
      setNewKeyInput('');
      setNewKeyLabel('');
      await loadGeminiKeys();
      setStatusMessage({
        type: 'success',
        text: `Đã thêm và kiểm tra Gemini API Key "${data.key?.label}".`,
      });
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi thêm Gemini API Key.',
      });
    } finally {
      setIsAddingKey(false);
    }
  };

  const handleProbeAllKeys = async () => {
    setIsProbingKeys(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/gemini-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'probe' }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.keys)) {
        setGeminiKeys(data.keys);
        setStatusMessage({
          type: 'success',
          text: `Đã kiểm tra kết nối cho ${data.keys.length} API keys.`,
        });
      } else {
        throw new Error(data.error || 'Kiểm tra thất bại.');
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi kiểm tra sức khỏe keys.',
      });
    } finally {
      setIsProbingKeys(false);
    }
  };

  const handleResetCooldowns = async () => {
    setIsResettingCooldowns(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/gemini-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_cooldowns' }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.keys)) {
        setGeminiKeys(data.keys);
        setStatusMessage({
          type: 'success',
          text: 'Đã đặt lại trạng thái Cooldown cho toàn bộ API keys.',
        });
      } else {
        throw new Error(data.error || 'Đặt lại cooldown thất bại.');
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi đặt lại cooldown keys.',
      });
    } finally {
      setIsResettingCooldowns(false);
    }
  };

  const handleDeleteGeminiKey = async (id: string) => {
    setDeletingKeyId(id);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/gemini-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      });
      const data = await res.json();
      if (res.ok) {
        setGeminiKeys((prev) => prev.filter((k) => k.id !== id));
        setStatusMessage({
          type: 'success',
          text: 'Đã xóa API key thành công.',
        });
      } else {
        throw new Error(data.error || 'Không thể xóa API key.');
      }
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi khi xóa key.',
      });
    } finally {
      setDeletingKeyId(null);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
      router.push('/admin/login');
      router.refresh();
    } catch (err) {
      console.error('Lỗi khi đăng xuất:', err);
      setIsLoggingOut(false);
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

  const isAnyActionPending = Boolean(
    togglingId ||
    deletingId ||
    isLoggingOut ||
    isProbingKeys ||
    isResettingCooldowns ||
    isAddingKey ||
    isReloading
  );

  const pendingActionText = togglingId
    ? `Đang đổi trạng thái hiển thị cho đề "${togglingId}"...`
    : deletingId
      ? `Đang xóa đề thi "${deletingId}" và toàn bộ file audio...`
      : isLoggingOut
        ? 'Đang đăng xuất khỏi hệ thống quản trị...'
        : isProbingKeys
          ? `Đang kiểm tra kết nối cho ${geminiKeys.length} Gemini API keys...`
          : isResettingCooldowns
            ? 'Đang đặt lại trạng thái Cooldown cho các API keys...'
            : isAddingKey
              ? 'Đang xác thực và lưu Gemini API Key mới...'
              : isReloading
                ? 'Đang đồng bộ và tải lại danh sách đề thi...'
                : null;

  return (
    <div className="space-y-6">
      {/* Visual Live API Processing Indicator */}
      {isAnyActionPending && (
        <div className="border-2 border-black bg-[#fef7e0] text-[#b06000] p-3 shadow-[3px_3px_0px_0px_#000] flex items-center justify-between gap-3 text-xs sm:text-sm font-bold animate-in fade-in duration-150">
          <div className="flex items-center gap-2 min-w-0">
            <Loader2 className="w-4 h-4 animate-spin shrink-0 text-[#b06000]" />
            <span className="truncate">{pendingActionText}</span>
          </div>
          <span className="text-[11px] font-mono uppercase bg-white border border-[#b06000] px-2 py-0.5 shrink-0 hidden sm:inline">
            Vui lòng đợi
          </span>
        </div>
      )}

      {/* Top Banner */}
      <div className="border-2 border-black bg-[#fffdf5] p-4 sm:p-6 shadow-[4px_4px_0px_0px_#000] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-black">
            <ShieldCheck className="w-6 h-6 stroke-[2.5]" />
            <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight">
              Quản Lý Đề Thi & Audio
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleToggleKeyManager}
            className={`border-2 border-black px-3 py-2 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${showKeyManager
              ? 'bg-[#f4eed9] text-black'
              : 'bg-white hover:bg-neutral-100 text-black'
              }`}
          >
            <Key className="w-4 h-4" />
            <span>Gemini Keys</span>
          </button>

          <Link
            href="/test/create"
            prefetch={false}
            className="border-2 border-black bg-black text-[#fffdf5] hover:bg-[#222] px-3.5 py-2 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-transform active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm đề mới</span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="border-2 border-black bg-white hover:bg-neutral-100 text-black px-3.5 py-2 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-wait"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Đang đăng xuất...</span>
              </>
            ) : (
              <>
                <LogOut className="w-4 h-4 shrink-0" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Gemini API Keys Pool Manager */}
      {showKeyManager && (
        <div className="border-2 border-black bg-[#fffdf5] p-4 shadow-[3px_3px_0px_0px_#000] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black pb-2.5">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-black" />
              <h2 className="text-sm font-black uppercase tracking-wider">
                Quản Lý Pool AI API Keys
              </h2>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleProbeAllKeys}
                disabled={isProbingKeys || isResettingCooldowns}
                className="border border-black bg-white hover:bg-neutral-100 px-2.5 py-1 text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60 disabled:cursor-wait transition-colors"
              >
                {isProbingKeys ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>Đang kiểm tra...</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-3.5 h-3.5 shrink-0" />
                    <span>Kiểm tra sức khỏe</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleResetCooldowns}
                disabled={isProbingKeys || isResettingCooldowns}
                className="border border-black bg-[#f4eed9] hover:bg-black hover:text-[#fffdf5] px-2.5 py-1 text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-wait"
              >
                {isResettingCooldowns ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    <span>Đang đặt lại...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    <span>Reset Cooldown</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <form onSubmit={handleAddGeminiKey} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newKeyLabel}
              disabled={isAddingKey}
              onChange={(e) => setNewKeyLabel(e.target.value)}
              placeholder="Nhãn (VD: GEMINI_KEY_9)"
              className="border-2 border-black bg-white px-3 py-1.5 text-xs font-mono sm:w-44 focus:outline-none disabled:bg-neutral-100 disabled:opacity-60"
            />
            <input
              type="password"
              value={newKeyInput}
              disabled={isAddingKey}
              onChange={(e) => setNewKeyInput(e.target.value)}
              placeholder="Dán Gemini API Key mới vào đây..."
              className="border-2 border-black bg-white px-3 py-1.5 text-xs font-mono flex-1 focus:outline-none disabled:bg-neutral-100 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isAddingKey || !newKeyInput.trim()}
              className="border-2 border-black bg-black text-[#fffdf5] px-4 py-1.5 text-xs font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5 min-w-23.75"
            >
              {isAddingKey ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>Đang thêm...</span>
                </>
              ) : (
                <span>Thêm Key</span>
              )}
            </button>
          </form>

          {isLoadingKeys ? (
            <div className="text-xs text-neutral-500 py-4 text-center flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang tải danh sách Gemini API Keys...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {geminiKeys.map((k) => (
                <div
                  key={k.id}
                  className={`border border-black bg-white p-2.5 text-xs flex items-center justify-between gap-2 transition-opacity ${deletingKeyId === k.id ? 'opacity-40 pointer-events-none bg-red-50' : ''
                    }`}
                >
                  <div className="min-w-0">
                    <div className="font-bold text-black flex items-center gap-1.5">
                      <span className="truncate">{k.label}</span>
                      <span
                        className={`px-1.5 py-0.2 text-[10px] font-mono uppercase border ${k.status === 'healthy'
                          ? 'bg-[#e6f4ea] text-[#137333] border-[#137333]'
                          : k.status === 'cooldown'
                            ? 'bg-[#fef7e0] text-[#b06000] border-[#b06000]'
                            : 'bg-red-100 text-red-800 border-red-600'
                          }`}
                      >
                        {k.status}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-neutral-500 mt-0.5">
                      {k.keyMasked} | OK: {k.successCount} | 429: {k.rateLimitCount}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteGeminiKey(k.id)}
                    disabled={deletingKeyId === k.id}
                    className="text-neutral-400 hover:text-red-700 p-1 cursor-pointer disabled:cursor-wait shrink-0"
                    title="Xóa key này"
                  >
                    {deletingKeyId === k.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-red-600" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="border-2 border-black bg-white p-4 shadow-sm">
          <span className="text-xs font-bold text-neutral-500 uppercase">
            Tổng số đề thi
          </span>
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
          className={`p-3.5 border-2 flex items-center justify-between gap-2 text-sm font-medium animate-in fade-in duration-150 ${statusMessage.type === 'success'
            ? 'bg-[#e6f4ea] border-[#137333] text-[#137333]'
            : 'bg-[#fce8e6] border-[#c5221f] text-[#c5221f]'
            }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="p-1 hover:opacity-70 transition-opacity cursor-pointer shrink-0"
            title="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
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
            className={`border-2 border-black px-2.5 py-1.5 text-xs font-bold cursor-pointer transition-colors ${filterStatus === 'all'
              ? 'bg-black text-[#fffdf5]'
              : 'bg-[#fffdf5] text-black hover:bg-neutral-100'
              }`}
          >
            Tất cả ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('public')}
            className={`border-2 border-black px-2.5 py-1.5 text-xs font-bold cursor-pointer transition-colors ${filterStatus === 'public'
              ? 'bg-black text-[#fffdf5]'
              : 'bg-[#fffdf5] text-black hover:bg-neutral-100'
              }`}
          >
            Công khai ({publicCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus('hidden')}
            className={`border-2 border-black px-2.5 py-1.5 text-xs font-bold cursor-pointer transition-colors ${filterStatus === 'hidden'
              ? 'bg-black text-[#fffdf5]'
              : 'bg-[#fffdf5] text-black hover:bg-neutral-100'
              }`}
          >
            Đang ẩn ({hiddenCount})
          </button>

          <button
            type="button"
            onClick={handleManualReload}
            disabled={isReloading}
            className="border-2 border-black bg-white hover:bg-neutral-100 text-black px-2.5 py-1.5 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-wait transition-colors"
            title="Tải lại danh sách đề thi từ máy chủ"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReloading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isReloading ? 'Đang tải...' : 'Làm mới'}</span>
          </button>
        </div>
      </div>

      {/* Table / List */}
      <div className="border-2 border-black bg-white shadow-sm overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm border-collapse min-w-175">
          <thead>
            <tr className="border-b-2 border-black bg-[#f4eed9] text-black font-black uppercase text-[11px] sm:text-xs tracking-wider">
              <th className="p-3">Mã đề (ID), Tiêu đề & Metadata</th>
              <th className="p-3 w-36 text-center">Audio & Trạng thái</th>
              <th className="p-3 w-80 text-right">Thao tác Quản trị</th>
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
                const isDeleting = deletingId === test.id;
                const isRowBusy = isToggling || isDeleting;
                const isGeneratingTts = generatingTtsId === test.id;
                const totalListening = test.listeningPartCount ?? 0;
                const readyListening = test.audioReadyCount ?? 0;
                const isAudioFull =
                  totalListening === 0 || readyListening >= totalListening;

                return (
                  <tr
                    key={test.id}
                    className={`transition-all duration-150 ${isDeleting
                        ? 'opacity-40 pointer-events-none bg-red-50'
                        : isToggling
                          ? 'bg-amber-50/70'
                          : 'hover:bg-neutral-50'
                      }`}
                  >
                    <td className="p-3">
                      <div className="flex items-start gap-2.5">
                        <FileText className="w-5 h-5 text-neutral-500 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold text-black flex flex-wrap items-center gap-1.5">
                            <span>{test.title}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-neutral-600 mt-1">
                            <span className="bg-neutral-100 border border-neutral-300 px-1.5 py-0.2 font-semibold text-black">
                              ID: {test.id}
                            </span>
                            {test.level && (
                              <span className="bg-black text-[#fffdf5] px-1.5 py-0.2 font-bold">
                                {test.examSystem === 'HSK' ? test.level : `${test.examSystem || 'CEFR'} ${test.level}`}
                              </span>
                            )}
                            {typeof test.totalQuestions === 'number' && (
                              <span className="bg-[#f4eed9] border border-black px-1.5 py-0.2 text-black font-semibold">
                                {test.totalQuestions} câu (R:{test.readingQuestionCount ?? 0} / L:{test.listeningQuestionCount ?? 0})
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-600 line-clamp-1 mt-1">
                            {test.description}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="p-3 text-center align-middle space-y-1.5">
                      <div>
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
                      </div>

                      {totalListening > 0 && (
                        <div>
                          <span
                            className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[10px] font-mono font-bold rounded-sm ${isAudioFull
                              ? 'border-[#137333] bg-[#e6f4ea]/60 text-[#137333]'
                              : 'border-[#b06000] bg-[#fef7e0] text-[#b06000]'
                              }`}
                          >
                            <Volume2 className="w-3 h-3" />
                            <span>
                              {readyListening}/{totalListening} Audio
                            </span>
                          </span>
                        </div>
                      )}
                    </td>

                    <td className="p-3 text-right align-middle">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {/* Toggle Visibility */}
                        <button
                          type="button"
                          onClick={() => handleToggle(test.id)}
                          disabled={isRowBusy || Boolean(togglingId) || Boolean(deletingId)}
                          className={`border-2 border-black font-bold px-2.5 py-1 text-xs inline-flex items-center justify-center min-w-19 gap-1 transition-all ${isRowBusy
                              ? 'cursor-wait opacity-80'
                              : 'cursor-pointer hover:shadow-xs'
                            } ${isHidden
                              ? 'bg-[#137333] text-white hover:bg-[#0d5926]'
                              : 'bg-[#fffdf5] text-black hover:bg-neutral-200'
                            }`}
                          title={
                            isHidden
                              ? 'Mở hiển thị công khai bài này'
                              : 'Ẩn bài thi này khỏi thí sinh'
                          }
                        >
                          {isToggling ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                              <span>{isHidden ? 'Đang hiện...' : 'Đang ẩn...'}</span>
                            </>
                          ) : isHidden ? (
                            <>
                              <Eye className="w-3.5 h-3.5 shrink-0" />
                              <span>Hiện</span>
                            </>
                          ) : (
                            <>
                              <EyeOff className="w-3.5 h-3.5 shrink-0" />
                              <span>Ẩn</span>
                            </>
                          )}
                        </button>

                        {/* Trigger / Manage TTS & Audio */}
                        <button
                          type="button"
                          onClick={() => handleGenerateTts(test.id, test.title)}
                          disabled={isRowBusy || (isGeneratingTts && activeModalTest?.id === test.id)}
                          className={`border-2 border-black bg-[#fffdf5] hover:bg-neutral-200 text-black font-bold px-2.5 py-1 text-xs inline-flex items-center justify-center min-w-21.25 gap-1 transition-colors ${isRowBusy ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                            }`}
                          title="Quản lý Audio, tạo giọng đọc TTS hoặc tải file MP3"
                        >
                          {isGeneratingTts && activeModalTest?.id === test.id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                              <span>Đang mở...</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Audio/TTS</span>
                            </>
                          )}
                        </button>

                        {/* Edit JSON in Authoring View */}
                        <Link
                          href={`/test/create?edit=${encodeURIComponent(test.id)}`}
                          prefetch={false}
                          className={`border-2 border-black bg-[#f4eed9] hover:bg-black hover:text-[#fffdf5] text-black font-bold px-2 py-1 text-xs inline-flex items-center gap-1 transition-colors ${isRowBusy ? 'pointer-events-none opacity-40' : ''
                            }`}
                          title="Chỉnh sửa JSON đề thi trực tiếp"
                        >
                          <Edit3 className="w-3.5 h-3.5 shrink-0" />
                          <span>Sửa</span>
                        </Link>

                        {/* Delete Test */}
                        <button
                          type="button"
                          onClick={() => handleDeleteTest(test.id, test.title)}
                          disabled={isRowBusy || Boolean(togglingId) || Boolean(deletingId)}
                          className={`border-2 border-black font-bold px-2.5 py-1 text-xs inline-flex items-center justify-center min-w-8.5 sm:min-w-16 gap-1 transition-all ${isDeleting
                              ? 'bg-red-600 text-white cursor-wait opacity-90'
                              : isRowBusy
                                ? 'opacity-40 cursor-not-allowed bg-white text-red-700'
                                : 'bg-white hover:bg-red-600 hover:text-white text-red-700 cursor-pointer'
                            }`}
                          title="Xóa đề thi và audio"
                        >
                          {isDeleting ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                              <span className="hidden sm:inline">Đang xóa...</span>
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-3.5 h-3.5 shrink-0" />
                              <span className="hidden sm:inline">Xóa</span>
                            </>
                          )}
                        </button>

                        {/* Preview / View Link */}
                        <Link
                          href={`/test/${encodeURIComponent(test.id)}`}
                          target="_blank"
                          prefetch={false}
                          className={`border-2 border-black bg-white hover:bg-neutral-100 text-black font-bold px-2 py-1 text-xs inline-flex items-center gap-1 transition-colors ${isRowBusy ? 'pointer-events-none opacity-40' : ''
                            }`}
                          title="Xem bài thi trực tiếp"
                        >
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
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

      {/* Visual Live TTS & Audio Manager Modal */}
      {activeModalTest && (
        <TtsProgressModal
          testId={activeModalTest.id}
          testTitle={activeModalTest.title}
          onClose={() => setActiveModalTest(null)}
          onFinished={() => {
            setGeneratingTtsId(null);
            void reloadTestsCatalog();
            router.refresh();
          }}
        />
      )}
    </div>
  );
};
