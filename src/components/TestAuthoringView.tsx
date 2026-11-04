'use client';

import React, { useState, useEffect, useId, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  TestDocument,
  Question,
  ReadingPassage,
  ListeningPart,
  SpeakingTask,
  WritingTask,
  TestCatalog,
} from '@/types/test';
import { validateTestDocument } from '@/domain/validator';
import { countWordsOrCharacters } from '@/domain/grader';
import { SAMPLE_TEST_TEMPLATE } from '@/services/testTemplate';

import {
  Upload as IconUpload,
  FileCode as IconTemplate,
  Sparkles as IconPrettify,
  Download as IconDownload,
  Check as IconCheck,
  AlertTriangle as IconAlert,
  X as IconX,
} from 'lucide-react';

// --- Helpers ---
export function getNextIncrementedId(currentId: string, existingList: string[]): string {
  if (!currentId || !currentId.trim()) return 'test-01';
  const cleanId = currentId.trim();

  const match = cleanId.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const numStr = match[2];
    const num = parseInt(numStr, 10);
    const pad = numStr.length;

    let nextNum = num + 1;
    while (true) {
      const candidate = `${prefix}${String(nextNum).padStart(pad, '0')}`;
      if (!existingList.includes(candidate)) {
        return candidate;
      }
      nextNum++;
    }
  } else {
    const base = cleanId.endsWith('-') ? cleanId : `${cleanId}-`;
    const firstTry = `${base}01`;
    if (!existingList.includes(firstTry)) {
      return firstTry;
    }
    let nextNum = 2;
    while (true) {
      const candidate = `${base}${String(nextNum).padStart(2, '0')}`;
      if (!existingList.includes(candidate)) {
        return candidate;
      }
      nextNum++;
    }
  }
}

export function replaceIdInJsonText(originalJson: string, oldId: string, newId: string): string {
  try {
    const parsed = JSON.parse(originalJson);
    parsed.id = newId;
    const isMinified = !originalJson.includes('\n');
    return JSON.stringify(parsed, null, isMinified ? 0 : 2);
  } catch {
    return originalJson.replace(new RegExp(`"id"\\s*:\\s*"${oldId}"`), `"id": "${newId}"`);
  }
}

function countWords(str?: string): number {
  return countWordsOrCharacters(str);
}

function getQuestionTypeLabel(type: string): string {
  switch (type) {
    case 'multiple_choice':
      return 'Trắc nghiệm (1 đáp án)';
    case 'multiple_select':
      return 'Chọn nhiều đáp án';
    case 'fill_blank':
      return 'Điền từ';
    case 'true_false_ng':
      return 'True / False / Not Given';
    default:
      return type;
  }
}

// --- Main Component ---
export const TestAuthoringView: React.FC = () => {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonTextareaId = useId();

  const [jsonText, setJsonText] = useState<string>(() =>
    JSON.stringify(SAMPLE_TEST_TEMPLATE, null, 2)
  );
  const [existingIds, setExistingIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<{ id: string; message: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ID collision modal state
  const [conflictModal, setConflictModal] = useState<{
    currentId: string;
    suggestedId: string;
  } | null>(null);

  // Preview tab
  const [activePreviewTab, setActivePreviewTab] = useState<
    'overview' | 'reading' | 'listening' | 'speaking' | 'writing' | 'answers'
  >('overview');
  const [expandedPassageIds, setExpandedPassageIds] = useState<Record<string, boolean>>({});
  const [expandedTranscriptIds, setExpandedTranscriptIds] = useState<Record<string, boolean>>({});
  const [expandedSampleIds, setExpandedSampleIds] = useState<Record<string, boolean>>({});

  // Fetch catalog on mount to know existing test IDs
  useEffect(() => {
    let isMounted = true;
    async function loadCatalog() {
      try {
        const res = await fetch('/api/tests');
        if (res.ok) {
          const catalog: TestCatalog = await res.json();
          if (isMounted && catalog && Array.isArray(catalog.tests)) {
            setExistingIds(catalog.tests.map((t) => t.id));
          }
        }
      } catch {
        // Fallback silently if offline or catalog not ready
      }
    }
    loadCatalog();
    return () => {
      isMounted = false;
    };
  }, []);

  // Real-time validation via derived state (useMemo)
  const { syntaxError, validationErrors, parsedDoc } = useMemo(() => {
    if (!jsonText.trim()) {
      return {
        syntaxError: 'Vui lòng nhập JSON đề thi.',
        validationErrors: [] as string[],
        parsedDoc: null,
      };
    }

    try {
      const parsed = JSON.parse(jsonText);
      const validation = validateTestDocument(parsed);
      if (validation.valid && validation.data) {
        return {
          syntaxError: null,
          validationErrors: [] as string[],
          parsedDoc: validation.data,
        };
      } else {
        return {
          syntaxError: null,
          validationErrors: validation.errors,
          parsedDoc: parsed && typeof parsed === 'object' ? (parsed as TestDocument) : null,
        };
      }
    } catch (err) {
      return {
        syntaxError: err instanceof Error ? err.message : 'Cú pháp JSON không hợp lệ.',
        validationErrors: [] as string[],
        parsedDoc: null,
      };
    }
  }, [jsonText]);

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setJsonText(content);
        setSaveSuccess(null);
        setSaveError(null);
      }
    };
    reader.onerror = () => {
      setSaveError('Không thể đọc file.');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Prettify JSON
  const handlePrettify = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      setSaveError(null);
    } catch (err) {
      setSaveError(`JSON lỗi cú pháp: ${err instanceof Error ? err.message : ''}`);
    }
  };

  // Load starter template
  const handleLoadTemplate = () => {
    if (
      jsonText.trim() &&
      jsonText.trim() !== JSON.stringify(SAMPLE_TEST_TEMPLATE, null, 2).trim()
    ) {
      if (!window.confirm('Nạp đề mẫu sẽ thay thế nội dung hiện tại. Tiếp tục?')) {
        return;
      }
    }
    setJsonText(JSON.stringify(SAMPLE_TEST_TEMPLATE, null, 2));
    setSaveSuccess(null);
    setSaveError(null);
  };

  // Download JSON to device
  const handleDownload = () => {
    try {
      const filename = `${parsedDoc?.id || 'test'}.json`;
      const blob = new Blob([jsonText], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setSaveError('Không thể tải file về.');
    }
  };

  // Core execution of saving a verified test document
  const executeSave = async (docToSave: TestDocument) => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const res = await fetch('/api/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: docToSave }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 || data.conflict) {
          const currentList = Array.from(new Set([...existingIds, docToSave.id]));
          setExistingIds(currentList);
          const suggested = getNextIncrementedId(docToSave.id, currentList);
          setConflictModal({
            currentId: docToSave.id,
            suggestedId: suggested,
          });
          return;
        }
        throw new Error(data.error || 'Lỗi khi lưu đề thi.');
      }

      setExistingIds((prev) => Array.from(new Set([...prev, docToSave.id])));
      setSaveSuccess({
        id: data.id || docToSave.id,
        message: data.message || `Đã lưu thành công "${docToSave.title}".`,
      });
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Lỗi khi lưu đề thi.');
    } finally {
      setIsSaving(false);
    }
  };

  // User click on save button
  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(null);

    if (syntaxError) {
      setSaveError(`Lỗi cú pháp: ${syntaxError}`);
      return;
    }

    if (validationErrors.length > 0) {
      setSaveError(`Còn ${validationErrors.length} lỗi cần sửa trước khi lưu.`);
      return;
    }

    if (!parsedDoc || !parsedDoc.id) {
      setSaveError('Thiếu dữ liệu đề hoặc mã ID.');
      return;
    }

    if (existingIds.includes(parsedDoc.id)) {
      const suggested = getNextIncrementedId(parsedDoc.id, existingIds);
      setConflictModal({
        currentId: parsedDoc.id,
        suggestedId: suggested,
      });
      return;
    }

    await executeSave(parsedDoc);
  };

  // Apply new incremented ID from conflict modal
  const handleApplyNewId = async (newId: string, andSave: boolean) => {
    if (!conflictModal) return;
    const oldId = conflictModal.currentId;
    const updatedJson = replaceIdInJsonText(jsonText, oldId, newId);
    setJsonText(updatedJson);
    setConflictModal(null);

    if (parsedDoc) {
      const updatedDoc: TestDocument = {
        ...parsedDoc,
        id: newId,
      };
      if (andSave) {
        await executeSave(updatedDoc);
      }
    }
  };

  const isIdDuplicate = Boolean(parsedDoc?.id && existingIds.includes(parsedDoc.id));
  const isValid = !syntaxError && validationErrors.length === 0 && Boolean(parsedDoc?.id);

  // Helper counts
  const readingPassageCount = parsedDoc?.sections?.reading?.passages?.length || 0;
  const readingQuestionCount =
    parsedDoc?.sections?.reading?.passages?.reduce(
      (acc, p) => acc + (Array.isArray(p?.questions) ? p.questions.length : 0),
      0
    ) || 0;
  const listeningPartCount = parsedDoc?.sections?.listening?.parts?.length || 0;
  const listeningQuestionCount =
    parsedDoc?.sections?.listening?.parts?.reduce(
      (acc, p) => acc + (Array.isArray(p?.questions) ? p.questions.length : 0),
      0
    ) || 0;
  const speakingTaskCount = parsedDoc?.sections?.speaking?.tasks?.length || 0;
  const writingTaskCount = parsedDoc?.sections?.writing?.tasks?.length || 0;
  const totalQuestions = readingQuestionCount + listeningQuestionCount;

  // Flattened questions for the Answer Key Matrix
  const answerKeyMatrix: Array<{
    stt: number;
    partName: string;
    id: string;
    type: string;
    correctAnswer: string;
  }> = [];

  let sttCounter = 1;
  parsedDoc?.sections?.reading?.passages?.forEach((p, pIdx) => {
    p?.questions?.forEach((q) => {
      let answerSummary = '';
      if (q.type === 'multiple_choice') answerSummary = q.correctAnswer;
      else if (q.type === 'multiple_select') answerSummary = q.correctAnswers.join(', ');
      else if (q.type === 'fill_blank') answerSummary = q.acceptedAnswers.join(' / ');
      else if (q.type === 'true_false_ng') answerSummary = q.correctAnswer;

      answerKeyMatrix.push({
        stt: sttCounter++,
        partName: `Reading P${pIdx + 1}`,
        id: q.id,
        type: q.type,
        correctAnswer: answerSummary,
      });
    });
  });

  parsedDoc?.sections?.listening?.parts?.forEach((part, partIdx) => {
    part?.questions?.forEach((q) => {
      let answerSummary = '';
      if (q.type === 'multiple_choice') answerSummary = q.correctAnswer;
      else if (q.type === 'multiple_select') answerSummary = q.correctAnswers.join(', ');
      else if (q.type === 'fill_blank') answerSummary = q.acceptedAnswers.join(' / ');
      else if (q.type === 'true_false_ng') answerSummary = q.correctAnswer;

      answerKeyMatrix.push({
        stt: sttCounter++,
        partName: `Listening P${partIdx + 1}`,
        id: q.id,
        type: q.type,
        correctAnswer: answerSummary,
      });
    });
  });

  // Toggle helpers
  const togglePassage = (id: string) => {
    setExpandedPassageIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const toggleTranscript = (id: string) => {
    setExpandedTranscriptIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const toggleSample = (id: string) => {
    setExpandedSampleIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-4 pb-12 w-full min-w-0 overflow-x-hidden">
      {/* Top Banner & Title */}
      <section className="border-2 border-black p-3.5 sm:p-4 bg-[#fffdf5] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] w-full min-w-0 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-black">
              Thêm đề thi
            </h2>
            <p className="text-xs text-neutral-600 mt-0.5">
              Soạn hoặc tải file JSON để lưu đề vào hệ thống.
            </p>
          </div>

          <div className="shrink-0 flex items-center">
            {syntaxError ? (
              <span className="border border-red-700 bg-red-100 text-red-950 px-2 py-0.5 text-xs font-bold">
                Lỗi JSON
              </span>
            ) : validationErrors.length > 0 ? (
              <span className="border border-amber-700 bg-amber-100 text-amber-950 px-2 py-0.5 text-xs font-bold">
                Chưa đạt ({validationErrors.length})
              </span>
            ) : isIdDuplicate ? (
              <span className="border border-amber-700 bg-amber-100 text-amber-950 px-2 py-0.5 text-xs font-bold">
                Trùng ID
              </span>
            ) : (
              <span className="border border-emerald-700 bg-emerald-100 text-emerald-950 px-2 py-0.5 text-xs font-bold">
                Hợp lệ
              </span>
            )}
          </div>
        </div>

        {/* Toolbar Buttons */}
        <div className="pt-2 border-t border-neutral-200 flex flex-wrap items-center gap-1.5">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".json,application/json"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="border border-black px-2.5 py-1 bg-[#f4eed9] text-black font-semibold text-xs hover:bg-black hover:text-[#fffdf5] transition-colors cursor-pointer flex items-center gap-1"
          >
            <IconUpload className="w-3.5 h-3.5 shrink-0" />
            <span>Tải file</span>
          </button>

          <button
            type="button"
            onClick={handleLoadTemplate}
            className="border border-black px-2.5 py-1 bg-[#fffdf5] text-black font-semibold text-xs hover:bg-[#f4eed9] transition-colors cursor-pointer flex items-center gap-1"
          >
            <IconTemplate className="w-3.5 h-3.5 shrink-0" />
            <span>Đề mẫu</span>
          </button>

          <button
            type="button"
            onClick={handlePrettify}
            disabled={Boolean(syntaxError)}
            className="border border-black px-2.5 py-1 bg-[#fffdf5] text-black font-semibold text-xs hover:bg-[#f4eed9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1"
          >
            <IconPrettify className="w-3.5 h-3.5 shrink-0" />
            <span>Format</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="border border-black px-2.5 py-1 bg-[#fffdf5] text-black font-semibold text-xs hover:bg-[#f4eed9] transition-colors cursor-pointer flex items-center gap-1"
          >
            <IconDownload className="w-3.5 h-3.5 shrink-0" />
            <span>Tải về</span>
          </button>
        </div>
      </section>

      {/* Save Success Alert */}
      {saveSuccess && (
        <div className="border border-emerald-800 p-3 bg-emerald-50 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <IconCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span className="font-semibold">{saveSuccess.message}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/test/${saveSuccess.id}`}
              className="px-2.5 py-1 bg-black text-[#fffdf5] font-bold text-xs hover:bg-neutral-800"
            >
              Làm bài
            </Link>
            <Link
              href="/"
              className="px-2.5 py-1 border border-black bg-white text-black font-medium text-xs hover:bg-neutral-100"
            >
              Danh sách đề
            </Link>
            <button
              type="button"
              onClick={() => setSaveSuccess(null)}
              className="p-1 hover:text-black"
            >
              <IconX className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Save Error Alert */}
      {saveError && (
        <div className="border border-red-700 p-3 bg-red-50 text-red-950 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <IconAlert className="w-4 h-4 text-red-700 shrink-0" />
            <span className="font-medium">{saveError}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="p-1 text-red-800 hover:text-black shrink-0"
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Split Grid: Editor (Left) & Preview / Errors (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: JSON Code Editor */}
        <div className="lg:col-span-6 space-y-3">
          <div className="border-2 border-black bg-[#fffdf5] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex flex-col">
            <div className="border-b border-black px-3 py-2 bg-[#f4eed9] flex items-center justify-between text-xs">
              <label
                htmlFor={jsonTextareaId}
                className="font-mono font-bold text-black cursor-pointer"
              >
                JSON ({jsonText.split('\n').length} dòng)
              </label>

              <button
                type="button"
                onClick={() => setJsonText('')}
                className="text-neutral-600 hover:text-black underline cursor-pointer"
              >
                Xóa trắng
              </button>
            </div>

            <div className="p-2.5 bg-[#fbf9f0]">
              <textarea
                id={jsonTextareaId}
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  setSaveSuccess(null);
                  setSaveError(null);
                }}
                spellCheck={false}
                rows={24}
                aria-label="Mã nguồn JSON"
                placeholder="Dán mã JSON đề thi tại đây..."
                className="w-full font-mono text-xs bg-[#fffdf5] text-neutral-900 p-2.5 leading-relaxed outline-none border border-black resize-y focus:bg-white transition-all"
              />
            </div>

            <div className="border-t border-black p-3 bg-[#fffdf5] flex items-center justify-between">
              <button
                type="button"
                onClick={handleSave}
                disabled={!isValid || isSaving}
                className="border-2 border-black px-4 py-2 bg-black text-[#fffdf5] font-bold text-xs sm:text-sm hover:bg-[#fffdf5] hover:text-black disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
              >
                {isSaving ? 'Đang lưu...' : 'Lưu đề thi'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live Validation & Review */}
        <div className="lg:col-span-6 space-y-3">
          {/* Validation Checklist Box */}
          <div className="border-2 border-black bg-[#fffdf5] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <div className="border-b border-black px-3 py-2 bg-[#f4eed9] flex items-center justify-between text-xs font-mono">
              <h3 className="font-bold text-black">Kiểm tra</h3>
              <span className="text-neutral-600 font-semibold">
                {isValid && !isIdDuplicate
                  ? 'Hợp lệ'
                  : `${validationErrors.length + (syntaxError ? 1 : 0) + (isIdDuplicate ? 1 : 0)} lỗi`}
              </span>
            </div>

            <div className="p-3 space-y-2">
              {syntaxError && (
                <div className="border border-red-700 bg-red-50 p-2 text-xs text-red-950 font-mono">
                  {syntaxError}
                </div>
              )}

              {isIdDuplicate && (
                <div className="border border-amber-700 bg-amber-50 p-2 text-xs text-amber-950 flex items-center justify-between gap-2">
                  <span>Trùng mã ID: &quot;{parsedDoc?.id}&quot;</span>
                  <button
                    type="button"
                    onClick={() => {
                      if (parsedDoc?.id) {
                        const suggested = getNextIncrementedId(parsedDoc.id, existingIds);
                        setConflictModal({
                          currentId: parsedDoc.id,
                          suggestedId: suggested,
                        });
                      }
                    }}
                    className="font-bold underline hover:text-black cursor-pointer shrink-0"
                  >
                    Tăng số đuôi
                  </button>
                </div>
              )}

              {validationErrors.length > 0 && (
                <div className="border border-amber-700 bg-amber-50 p-2.5 text-xs text-amber-950 space-y-1.5 max-h-48 overflow-y-auto">
                  <div className="font-bold">Cần sửa {validationErrors.length} lỗi:</div>
                  <ul className="list-disc list-inside space-y-1 text-neutral-800">
                    {validationErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {isValid && !isIdDuplicate && (
                <div className="p-2 border border-emerald-600 bg-emerald-50 text-emerald-950 text-xs flex items-center gap-2">
                  <IconCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span className="font-medium">Cấu trúc hợp lệ, sẵn sàng lưu.</span>
                </div>
              )}
            </div>
          </div>

          {/* Test Document Preview Section */}
          <div className="border-2 border-black bg-[#fffdf5] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <div className="border-b border-black px-3 py-2 bg-[#f4eed9] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-mono">
                <h3 className="font-bold text-black">Xem trước</h3>
                {parsedDoc?.id && (
                  <span className="text-[11px] bg-black text-[#fffdf5] px-1.5 py-0.2">
                    {parsedDoc.id}
                  </span>
                )}
              </div>
            </div>

            {parsedDoc ? (
              <div className="p-3 space-y-3">
                {/* Meta details */}
                <div className="space-y-0.5 border-b border-neutral-200 pb-2.5">
                  <h4 className="text-sm font-bold text-black">
                    {parsedDoc.title || <span className="text-neutral-400 italic">Chưa có tiêu đề</span>}
                  </h4>
                  <p className="text-xs text-neutral-600 line-clamp-2">
                    {parsedDoc.description || <span className="text-neutral-400 italic">Chưa có mô tả</span>}
                  </p>
                </div>

                {/* Metrics Breakdown Grid */}
                <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-xs">
                  <div className="border border-neutral-300 p-1.5 bg-[#fffdf5]">
                    <div className="font-bold text-sm">{readingQuestionCount}</div>
                    <div className="text-[10px] text-neutral-500">Reading</div>
                  </div>
                  <div className="border border-neutral-300 p-1.5 bg-[#fffdf5]">
                    <div className="font-bold text-sm">{listeningQuestionCount}</div>
                    <div className="text-[10px] text-neutral-500">Listening</div>
                  </div>
                  <div className="border border-neutral-300 p-1.5 bg-[#fffdf5]">
                    <div className="font-bold text-sm">{speakingTaskCount}</div>
                    <div className="text-[10px] text-neutral-500">Speaking</div>
                  </div>
                  <div className="border border-neutral-300 p-1.5 bg-[#fffdf5]">
                    <div className="font-bold text-sm">{writingTaskCount}</div>
                    <div className="text-[10px] text-neutral-500">Writing</div>
                  </div>
                </div>

                {/* Section Review Tabs */}
                <div className="space-y-2.5 pt-1 border-t border-neutral-200">
                  <div className="flex items-center gap-1 border-b border-neutral-300 pb-1 overflow-x-auto text-xs">
                    {(
                      [
                        { id: 'overview', label: 'Tổng quan' },
                        { id: 'reading', label: `Reading (${readingQuestionCount})` },
                        { id: 'listening', label: `Listening (${listeningQuestionCount})` },
                        { id: 'speaking', label: `Speaking (${speakingTaskCount})` },
                        { id: 'writing', label: `Writing (${writingTaskCount})` },
                        { id: 'answers', label: `Đáp án (${totalQuestions})` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActivePreviewTab(tab.id)}
                        className={`px-2 py-1 font-semibold transition-colors cursor-pointer border shrink-0 text-xs ${
                          activePreviewTab === tab.id
                            ? 'bg-black text-[#fffdf5] border-black'
                            : 'bg-[#fffdf5] text-black border-transparent hover:border-black'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Tab 1: Overview */}
                  {activePreviewTab === 'overview' && (
                    <div className="space-y-2 text-xs font-mono">
                      <div className="border border-neutral-300 p-2.5 bg-[#fbf9f0] space-y-1 text-neutral-800">
                        <div><strong>Mã đề:</strong> {parsedDoc.id || 'N/A'}</div>
                        <div><strong>Câu trắc nghiệm:</strong> {totalQuestions}</div>
                        <div><strong>Bài tự luận:</strong> {speakingTaskCount + writingTaskCount}</div>
                      </div>

                      <div className="space-y-1 text-xs">
                        <div className="p-1.5 border border-neutral-200 bg-white flex justify-between">
                          <span>Reading</span>
                          <span className="text-neutral-600">{readingPassageCount} bài, {readingQuestionCount} câu</span>
                        </div>
                        <div className="p-1.5 border border-neutral-200 bg-white flex justify-between">
                          <span>Listening</span>
                          <span className="text-neutral-600">{listeningPartCount} phần, {listeningQuestionCount} câu</span>
                        </div>
                        <div className="p-1.5 border border-neutral-200 bg-white flex justify-between">
                          <span>Speaking</span>
                          <span className="text-neutral-600">{speakingTaskCount} bài</span>
                        </div>
                        <div className="p-1.5 border border-neutral-200 bg-white flex justify-between">
                          <span>Writing</span>
                          <span className="text-neutral-600">{writingTaskCount} bài</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab 2: Reading Details */}
                  {activePreviewTab === 'reading' && (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {parsedDoc.sections?.reading?.passages?.map((passage: ReadingPassage, pIdx: number) => {
                        const isExpanded = Boolean(expandedPassageIds[passage.id || `p-${pIdx}`]);
                        const words = countWords(passage.content);

                        return (
                          <div key={passage.id || pIdx} className="border border-neutral-300 bg-[#fffdf5] p-2.5 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-black">{passage.title}</span>
                              <span className="font-mono text-[11px] text-neutral-500">~{words} từ</span>
                            </div>

                            <div className="border border-neutral-200 p-2 bg-[#fbf9f0] text-xs space-y-1">
                              <p className={`whitespace-pre-wrap text-neutral-700 ${isExpanded ? '' : 'line-clamp-2'}`}>
                                {passage.content}
                              </p>
                              <button
                                type="button"
                                onClick={() => togglePassage(passage.id || `p-${pIdx}`)}
                                className="text-[11px] font-semibold text-black underline cursor-pointer"
                              >
                                {isExpanded ? 'Thu gọn' : 'Xem thêm'}
                              </button>
                            </div>

                            <div className="space-y-2 pt-1">
                              {passage.questions?.map((q: Question, qIdx: number) => (
                                <QuestionReviewCard key={q.id || qIdx} question={q} index={qIdx} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Tab 3: Listening Details */}
                  {activePreviewTab === 'listening' && (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {parsedDoc.sections?.listening?.parts?.map((part: ListeningPart, partIdx: number) => {
                        const isTranscriptExpanded = Boolean(expandedTranscriptIds[part.id || `part-${partIdx}`]);

                        return (
                          <div key={part.id || partIdx} className="border border-neutral-300 bg-[#fffdf5] p-2.5 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-black">{part.title}</span>
                              <span className="font-mono text-[11px] text-neutral-500">{part.questions?.length || 0} câu</span>
                            </div>

                            {part.transcript && (
                              <div className="border border-neutral-200 p-2 bg-[#fbf9f0] text-xs space-y-1">
                                <p className={`whitespace-pre-wrap font-mono text-[11px] text-neutral-700 ${isTranscriptExpanded ? '' : 'line-clamp-2'}`}>
                                  {part.transcript}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => toggleTranscript(part.id || `part-${partIdx}`)}
                                  className="text-[11px] font-semibold text-black underline cursor-pointer"
                                >
                                  {isTranscriptExpanded ? 'Thu gọn' : 'Xem transcript'}
                                </button>
                              </div>
                            )}

                            <div className="space-y-2 pt-1">
                              {part.questions?.map((q: Question, qIdx: number) => (
                                <QuestionReviewCard key={q.id || qIdx} question={q} index={qIdx} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Tab 4: Speaking Details */}
                  {activePreviewTab === 'speaking' && (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {parsedDoc.sections?.speaking?.tasks?.map((task: SpeakingTask, tIdx: number) => {
                        const isSampleExpanded = Boolean(expandedSampleIds[task.id || `spk-${tIdx}`]);

                        return (
                          <div key={task.id || tIdx} className="border border-neutral-300 bg-[#fffdf5] p-2.5 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-black">{task.title}</span>
                              <span className="font-mono text-[11px] text-neutral-500">{task.id}</span>
                            </div>

                            <p className="p-2 bg-[#fbf9f0] border border-neutral-200 text-neutral-800 whitespace-pre-wrap">
                              {task.prompt}
                            </p>

                            {task.sampleAnswer && (
                              <div>
                                <button
                                  type="button"
                                  onClick={() => toggleSample(task.id || `spk-${tIdx}`)}
                                  className="text-[11px] font-semibold text-neutral-700 underline cursor-pointer"
                                >
                                  {isSampleExpanded ? 'Thu gọn bài mẫu' : 'Xem bài mẫu'}
                                </button>
                                {isSampleExpanded && (
                                  <p className="mt-1 p-2 bg-white border border-neutral-200 text-neutral-700 italic text-[11px]">
                                    {task.sampleAnswer}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Tab 5: Writing Details */}
                  {activePreviewTab === 'writing' && (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {parsedDoc.sections?.writing?.tasks?.map((task: WritingTask, tIdx: number) => {
                        const isSampleExpanded = Boolean(expandedSampleIds[task.id || `wrt-${tIdx}`]);

                        return (
                          <div key={task.id || tIdx} className="border border-neutral-300 bg-[#fffdf5] p-2.5 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-black">{task.title}</span>
                              <span className="font-mono text-[11px] text-neutral-500">
                                {task.minWords ? `≥${task.minWords} từ` : task.id}
                              </span>
                            </div>

                            <p className="p-2 bg-[#fbf9f0] border border-neutral-200 text-neutral-800 whitespace-pre-wrap">
                              {task.prompt}
                            </p>

                            {task.sampleAnswer && (
                              <div>
                                <button
                                  type="button"
                                  onClick={() => toggleSample(task.id || `wrt-${tIdx}`)}
                                  className="text-[11px] font-semibold text-neutral-700 underline cursor-pointer"
                                >
                                  {isSampleExpanded ? 'Thu gọn bài mẫu' : 'Xem bài mẫu'}
                                </button>
                                {isSampleExpanded && (
                                  <p className="mt-1 p-2 bg-white border border-neutral-200 text-neutral-700 italic text-[11px]">
                                    {task.sampleAnswer}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Tab 6: Complete Answer Key Matrix */}
                  {activePreviewTab === 'answers' && (
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1 text-xs">
                      <div className="border border-black overflow-x-auto bg-[#fffdf5]">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-black bg-[#f4eed9] font-mono text-[11px] text-black">
                              <th className="p-1.5 border-r border-black w-10 text-center">STT</th>
                              <th className="p-1.5 border-r border-black">Phần</th>
                              <th className="p-1.5 border-r border-black">Mã</th>
                              <th className="p-1.5 font-bold">Đáp án</th>
                            </tr>
                          </thead>
                          <tbody>
                            {answerKeyMatrix.map((item) => (
                              <tr key={item.id} className="border-b border-neutral-200">
                                <td className="p-1.5 border-r border-neutral-300 font-mono text-center">
                                  {item.stt}
                                </td>
                                <td className="p-1.5 border-r border-neutral-300 text-[11px]">
                                  {item.partName}
                                </td>
                                <td className="p-1.5 border-r border-neutral-300 font-mono text-[11px]">
                                  {item.id}
                                </td>
                                <td className="p-1.5 font-mono font-bold text-emerald-900 bg-emerald-50 text-[11px]">
                                  {item.correctAnswer}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-neutral-400 font-mono text-xs">
                Chưa có dữ liệu đề thi.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal when ID collides */}
      {conflictModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="border-2 border-black bg-[#fffdf5] max-w-md w-full p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-3">
            <div className="flex items-center justify-between border-b border-black pb-2">
              <h3 className="font-bold text-sm text-black">
                Trùng mã đề thi
              </h3>
              <button
                type="button"
                onClick={() => setConflictModal(null)}
                className="p-1 hover:bg-neutral-200 cursor-pointer"
              >
                <IconX className="w-4 h-4 text-black" />
              </button>
            </div>

            <p className="text-xs text-neutral-800 leading-relaxed">
              Mã <code className="bg-amber-100 px-1 border border-black font-bold font-mono">{conflictModal.currentId}</code> đã tồn tại. Đổi sang <code className="bg-amber-200 px-1 border border-black font-bold font-mono">{conflictModal.suggestedId}</code> để lưu?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setConflictModal(null)}
                className="border border-black px-2.5 py-1 bg-[#fffdf5] text-black text-xs font-semibold cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => handleApplyNewId(conflictModal.suggestedId, false)}
                className="border border-black px-2.5 py-1 bg-[#f4eed9] text-black text-xs font-bold cursor-pointer"
              >
                Đổi mã
              </button>
              <button
                type="button"
                onClick={() => handleApplyNewId(conflictModal.suggestedId, true)}
                className="border border-black px-3 py-1 bg-black text-[#fffdf5] text-xs font-bold cursor-pointer"
              >
                Đổi &amp; Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Question Detailed Review Subcomponent ---
const QuestionReviewCard: React.FC<{
  question: Question;
  index: number;
}> = ({ question, index }) => {
  return (
    <div className="border border-neutral-300 p-2 bg-[#fffdf5] space-y-1.5 text-xs">
      <div className="flex items-center justify-between gap-1 text-[11px]">
        <div className="flex items-center gap-1.5 font-mono">
          <span className="font-bold text-black">Câu {index + 1}</span>
          <span className="text-neutral-500">({question.id})</span>
        </div>
        <span className="font-mono text-neutral-600 bg-[#f4eed9] px-1 py-0.2 border border-neutral-300 text-[10px]">
          {getQuestionTypeLabel(question.type)}
        </span>
      </div>

      <div className="font-medium text-neutral-900 leading-snug">
        {question.prompt}
      </div>

      {question.type === 'multiple_choice' && (
        <div className="space-y-0.5 pt-0.5">
          {question.options?.map((opt) => {
            const isCorrect = opt.id === question.correctAnswer;
            return (
              <div
                key={opt.id}
                className={`p-1 border flex items-center justify-between text-xs ${
                  isCorrect
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-semibold'
                    : 'bg-white border-neutral-200 text-neutral-700'
                }`}
              >
                <span>{opt.id}. {opt.text}</span>
                {isCorrect && <span className="text-[10px] text-emerald-700 font-bold">Đúng</span>}
              </div>
            );
          })}
        </div>
      )}

      {question.type === 'multiple_select' && (
        <div className="space-y-0.5 pt-0.5">
          {question.options?.map((opt) => {
            const isCorrect = question.correctAnswers?.includes(opt.id);
            return (
              <div
                key={opt.id}
                className={`p-1 border flex items-center justify-between text-xs ${
                  isCorrect
                    ? 'bg-emerald-50 border-emerald-600 text-emerald-950 font-semibold'
                    : 'bg-white border-neutral-200 text-neutral-700'
                }`}
              >
                <span>{opt.id}. {opt.text}</span>
                {isCorrect && <span className="text-[10px] text-emerald-700 font-bold">Đúng</span>}
              </div>
            );
          })}
        </div>
      )}

      {question.type === 'fill_blank' && (
        <div className="p-1 border border-emerald-600 bg-emerald-50 text-xs text-emerald-950">
          <span className="font-semibold">Đáp án: </span>
          <span>{question.acceptedAnswers?.join(' / ')}</span>
        </div>
      )}

      {question.type === 'true_false_ng' && (
        <div className="flex items-center gap-1 pt-0.5 font-mono text-xs">
          {(['TRUE', 'FALSE', 'NOT_GIVEN'] as const).map((choice) => {
            const isCorrect = choice === question.correctAnswer;
            return (
              <span
                key={choice}
                className={`px-1.5 py-0.5 border text-[10px] ${
                  isCorrect
                    ? 'bg-emerald-600 text-white border-black font-bold'
                    : 'bg-white text-neutral-600 border-neutral-300'
                }`}
              >
                {choice}
              </span>
            );
          })}
        </div>
      )}

      {question.explanation && (
        <p className="text-[11px] text-neutral-500 italic pt-0.5">
          Giải thích: {question.explanation}
        </p>
      )}
    </div>
  );
};
