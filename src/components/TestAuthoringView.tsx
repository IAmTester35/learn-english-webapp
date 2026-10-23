'use client';

import React, { useState, useEffect, useId, useRef } from 'react';
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

// --- Clean SVG Icons (Zero Emojis) ---
const IconUpload = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
  </svg>
);

const IconTemplate = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
  </svg>
);

const IconPrettify = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
  </svg>
);

const IconMinify = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

const IconDownload = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const IconRules = () => (
  <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IconCheck = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
);

const IconAlert = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const IconX = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

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
      return 'Trắc nghiệm đơn (1 đáp án)';
    case 'multiple_select':
      return 'Chọn nhiều đáp án';
    case 'fill_blank':
      return 'Điền từ vào chỗ trống';
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
  const [syntaxError, setSyntaxError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [parsedDoc, setParsedDoc] = useState<TestDocument | null>(SAMPLE_TEST_TEMPLATE);
  const [existingIds, setExistingIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<{ id: string; message: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ID collision modal state
  const [conflictModal, setConflictModal] = useState<{
    currentId: string;
    suggestedId: string;
  } | null>(null);

  // Preview tab & layout controls
  const [activePreviewTab, setActivePreviewTab] = useState<
    'overview' | 'reading' | 'listening' | 'speaking' | 'writing' | 'answers'
  >('overview');
  const [expandedPassageIds, setExpandedPassageIds] = useState<Record<string, boolean>>({});
  const [expandedTranscriptIds, setExpandedTranscriptIds] = useState<Record<string, boolean>>({});
  const [expandedSampleIds, setExpandedSampleIds] = useState<Record<string, boolean>>({});
  const [isWidePreview, setIsWidePreview] = useState(false);

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

  // Real-time validation
  useEffect(() => {
    if (!jsonText.trim()) {
      setSyntaxError('Vui lòng nhập hoặc dán nội dung JSON của đề thi.');
      setValidationErrors([]);
      setParsedDoc(null);
      return;
    }

    try {
      const parsed = JSON.parse(jsonText);
      setSyntaxError(null);

      const validation = validateTestDocument(parsed);
      if (validation.valid && validation.data) {
        setValidationErrors([]);
        setParsedDoc(validation.data);
      } else {
        setValidationErrors(validation.errors);
        setParsedDoc(parsed && typeof parsed === 'object' ? (parsed as TestDocument) : null);
      }
    } catch (err) {
      setSyntaxError(err instanceof Error ? err.message : 'Cú pháp JSON không hợp lệ.');
      setValidationErrors([]);
      setParsedDoc(null);
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
      setSaveError('Không thể đọc file từ thiết bị.');
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
      setSaveError(`Không thể làm đẹp vì JSON đang lỗi cú pháp: ${err instanceof Error ? err.message : ''}`);
    }
  };

  // Minify JSON
  const handleMinify = () => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed));
      setSaveError(null);
    } catch (err) {
      setSaveError(`Không thể thu gọn vì JSON đang lỗi cú pháp: ${err instanceof Error ? err.message : ''}`);
    }
  };

  // Load starter template
  const handleLoadTemplate = () => {
    if (
      jsonText.trim() &&
      jsonText.trim() !== JSON.stringify(SAMPLE_TEST_TEMPLATE, null, 2).trim()
    ) {
      if (!window.confirm('Nạp lại đề thi mẫu sẽ thay thế nội dung hiện tại trong trình soạn thảo. Bạn có muốn tiếp tục?')) {
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
      const filename = `${parsedDoc?.id || 'exam-test'}.json`;
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
      setSaveError('Không thể tạo file để tải về.');
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
          // ID Collision detected on server
          const currentList = Array.from(new Set([...existingIds, docToSave.id]));
          setExistingIds(currentList);
          const suggested = getNextIncrementedId(docToSave.id, currentList);
          setConflictModal({
            currentId: docToSave.id,
            suggestedId: suggested,
          });
          return;
        }
        throw new Error(data.error || 'Lỗi khi lưu đề thi vào hệ thống.');
      }

      setExistingIds((prev) => Array.from(new Set([...prev, docToSave.id])));
      setSaveSuccess({
        id: data.id || docToSave.id,
        message: data.message || `Đã lưu thành công bài thi "${docToSave.title}".`,
      });
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Lỗi không xác định khi lưu đề thi.');
    } finally {
      setIsSaving(false);
    }
  };

  // User click on save button
  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(null);

    if (syntaxError) {
      setSaveError(`Lỗi cú pháp JSON: ${syntaxError}`);
      return;
    }

    if (validationErrors.length > 0) {
      setSaveError(`Đề thi còn ${validationErrors.length} lỗi chuẩn quy định. Vui lòng sửa hết các lỗi trước khi lưu.`);
      return;
    }

    if (!parsedDoc || !parsedDoc.id) {
      setSaveError('Dữ liệu đề thi trống hoặc thiếu mã ID.');
      return;
    }

    // Check if ID already exists on the client
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
      setParsedDoc(updatedDoc);
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
    section: string;
    partName: string;
    id: string;
    type: string;
    correctAnswer: string;
    hasExplanation: boolean;
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
        section: 'Reading',
        partName: `Passage ${pIdx + 1}`,
        id: q.id,
        type: q.type,
        correctAnswer: answerSummary,
        hasExplanation: Boolean(q.explanation),
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
        section: 'Listening',
        partName: `Part ${partIdx + 1}`,
        id: q.id,
        type: q.type,
        correctAnswer: answerSummary,
        hasExplanation: Boolean(q.explanation),
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
    <div className="space-y-6 pb-16 w-full min-w-0 overflow-x-hidden">
      {/* Top Banner & Title */}
      <section className="border-2 border-black p-4 sm:p-6 bg-[#fffdf5] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] w-full min-w-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-black pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3.5 h-3.5 bg-black inline-block"></span>
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-neutral-700">
                Exam Authoring Studio
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-black">
              Thêm Đề Thi Mới Trên Web
            </h2>
            <p className="text-sm font-semibold text-neutral-800 mt-1 max-w-2xl leading-relaxed">
              Nhập trực tiếp mã JSON hoặc tải file <code className="bg-[#f4eed9] px-1 py-0.5 border border-black text-xs font-mono">.json</code> vào hệ thống. Cấu trúc 4 kỹ năng (Reading, Listening, Speaking, Writing) được tự động kiểm tra và bảo toàn tính toàn vẹn.
            </p>
          </div>

          {/* Validation Status Pill */}
          <div className="shrink-0 flex items-center">
            {syntaxError ? (
              <div className="border-2 border-black bg-red-100 text-red-950 px-3 py-1.5 font-bold text-xs flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block animate-pulse"></span>
                <span>Lỗi cú pháp JSON</span>
              </div>
            ) : validationErrors.length > 0 ? (
              <div className="border-2 border-black bg-amber-100 text-amber-950 px-3 py-1.5 font-bold text-xs flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block"></span>
                <span>{validationErrors.length} điểm chưa đạt chuẩn</span>
              </div>
            ) : isIdDuplicate ? (
              <div className="border-2 border-black bg-amber-100 text-amber-950 px-3 py-1.5 font-bold text-xs flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block"></span>
                <span>Mã ID đã có trong hệ thống</span>
              </div>
            ) : (
              <div className="border-2 border-black bg-emerald-100 text-emerald-950 px-3 py-1.5 font-bold text-xs flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span>
                <span>Cấu trúc chuẩn & Hợp lệ</span>
              </div>
            )}
          </div>
        </div>

        {/* Toolbar Buttons */}
        <div className="pt-4 flex flex-wrap items-center gap-2">
          {/* File input (hidden) */}
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
            className="border-2 border-black px-3 py-1.5 bg-[#f4eed9] text-black font-bold text-xs sm:text-sm hover:bg-black hover:text-[#fffdf5] transition-colors cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            title="Chọn file .json từ máy tính của bạn"
          >
            <IconUpload />
            <span>Tải file .json từ máy</span>
          </button>

          <button
            type="button"
            onClick={handleLoadTemplate}
            className="border-2 border-black px-3 py-1.5 bg-[#fffdf5] text-black font-bold text-xs sm:text-sm hover:bg-[#f4eed9] transition-colors cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            title="Nạp cấu trúc bài thi mẫu chuẩn 4 kỹ năng"
          >
            <IconTemplate />
            <span>Nạp đề mẫu chuẩn</span>
          </button>

          <button
            type="button"
            onClick={handlePrettify}
            disabled={Boolean(syntaxError)}
            className="border-2 border-black px-3 py-1.5 bg-[#fffdf5] text-black font-bold text-xs sm:text-sm hover:bg-[#f4eed9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            title="Định dạng lại thụt lề JSON cho dễ đọc"
          >
            <IconPrettify />
            <span>Làm đẹp JSON</span>
          </button>

          <button
            type="button"
            onClick={handleMinify}
            disabled={Boolean(syntaxError)}
            className="border-2 border-black px-3 py-1.5 bg-[#fffdf5] text-black font-bold text-xs sm:text-sm hover:bg-[#f4eed9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            title="Nén nhỏ JSON loại bỏ khoảng trắng và dòng trống"
          >
            <IconMinify />
            <span>Thu gọn JSON (Minify)</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="border-2 border-black px-3 py-1.5 bg-[#fffdf5] text-black font-bold text-xs sm:text-sm hover:bg-[#f4eed9] transition-colors cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            title="Tải nội dung JSON trong trình soạn thảo về máy"
          >
            <IconDownload />
            <span>Tải JSON về máy</span>
          </button>

          <button
            type="button"
            className="border-2 border-black px-3 py-1.5 bg-[#fffdf5] text-black font-bold text-xs sm:text-sm hover:bg-[#f4eed9] transition-colors cursor-pointer flex items-center gap-1.5 ml-auto shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            onClick={() => {
              alert(
                'Quy chuẩn đề thi:\n' +
                '1. id: Chỉ chứa chữ thường, số, dấu gạch nối (ví dụ: b1-test-05).\n' +
                '2. Mỗi câu hỏi phải có id duy nhất toàn bài (ví dụ: r-q1, l-q1).\n' +
                '3. Bốn kỹ năng bắt buộc: reading, listening, speaking, writing.\n' +
                '4. Các dạng câu hỏi hỗ trợ: multiple_choice, multiple_select, fill_blank, true_false_ng.\n' +
                '5. Bảo vệ dữ liệu: Không cho phép ghi đè bài thi đã có ID trên hệ thống.'
              );
            }}
          >
            <IconRules />
            <span>Quy tắc chuẩn</span>
          </button>
        </div>
      </section>

      {/* Save Success Alert */}
      {saveSuccess && (
        <div className="border-2 border-black p-4 bg-emerald-100 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 bg-emerald-600 text-[#fffdf5] flex items-center justify-center shrink-0 border border-black font-bold text-sm">
              <IconCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-emerald-950 text-base">Lưu Đề Thi Thành Công!</h3>
              <p className="text-sm font-semibold text-emerald-900 mt-0.5">{saveSuccess.message}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t-2 border-emerald-900/20">
            <Link
              href={`/test/${saveSuccess.id}`}
              className="border-2 border-black px-4 py-2 bg-black text-[#fffdf5] font-black text-xs sm:text-sm hover:bg-[#fffdf5] hover:text-black transition-colors cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            >
              Làm thử bài thi ngay &rarr;
            </Link>
            <Link
              href="/"
              className="border-2 border-black px-4 py-2 bg-[#fffdf5] text-black font-bold text-xs sm:text-sm hover:bg-[#f4eed9] transition-colors cursor-pointer"
            >
              Về trang chủ danh mục đề thi
            </Link>
            <button
              type="button"
              onClick={() => {
                setSaveSuccess(null);
                setSaveError(null);
              }}
              className="border-2 border-black px-3 py-2 bg-[#f4eed9] text-black font-bold text-xs sm:text-sm hover:bg-black hover:text-[#fffdf5] transition-colors cursor-pointer ml-auto"
            >
              Tiếp tục chỉnh sửa
            </button>
          </div>
        </div>
      )}

      {/* Save Error Alert */}
      {saveError && (
        <div className="border-2 border-black p-4 bg-red-100 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-6 bg-red-600 text-[#fffdf5] flex items-center justify-center shrink-0 border border-black font-bold text-xs">
              <IconAlert className="w-4 h-4" />
            </div>
            <div className="space-y-1">
              <h3 className="font-black text-red-950 text-sm">Không thể lưu bài thi</h3>
              <p className="text-xs sm:text-sm font-semibold text-red-900 whitespace-pre-wrap">{saveError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Split Grid: Editor (Left) & Preview / Errors (Right) */}
      <div className={`grid gap-6 ${isWidePreview ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-12'}`}>
        {/* Left Column: JSON Code Editor */}
        <div className={`${isWidePreview ? 'hidden' : 'lg:col-span-6'} space-y-4`}>
          <div className="border-2 border-black bg-[#fffdf5] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col">
            <div className="border-b-2 border-black px-4 py-2.5 bg-[#f4eed9] flex items-center justify-between">
              <label
                htmlFor={jsonTextareaId}
                className="font-mono text-xs font-bold uppercase tracking-wider text-black flex items-center gap-1.5 cursor-pointer"
              >
                <span>Trình Soạn Thảo JSON Đề Thi</span>
                <span className="text-neutral-500">
                  ({jsonText.split('\n').length} dòng, {jsonText.length.toLocaleString()} ký tự)
                </span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setJsonText('')}
                  className="text-xs font-bold text-neutral-700 hover:text-black underline cursor-pointer"
                >
                  Xóa trắng
                </button>
              </div>
            </div>

            {/* Light yellowish-white warm paper editor container */}
            <div className="p-3 bg-[#fbf9f0]">
              <textarea
                id={jsonTextareaId}
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  setSaveSuccess(null);
                  setSaveError(null);
                }}
                spellCheck={false}
                rows={28}
                aria-label="Mã nguồn JSON của bài thi"
                placeholder="Dán mã JSON đề thi tại đây hoặc tải file .json từ máy tính..."
                className="json-editor-textarea w-full font-mono text-xs sm:text-sm bg-[#fffdf5] text-neutral-900 p-3 leading-relaxed outline-none border-2 border-black resize-y focus:bg-white focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
              />
            </div>

            {/* Editor Footer: Save Action Bar */}
            <div className="border-t-2 border-black p-4 bg-[#fffdf5] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={!isValid || isSaving}
                className="border-2 border-black px-6 py-2.5 bg-black text-[#fffdf5] font-black text-sm hover:bg-[#fffdf5] hover:text-black disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer shrink-0"
              >
                {isSaving ? 'Đang lưu vào hệ thống...' : 'Lưu Đề Thi Vào Hệ Thống'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live Validation & Comprehensive Review */}
        <div className={`${isWidePreview ? 'w-full' : 'lg:col-span-6'} space-y-4`}>
          {/* Validation Checklist Box */}
          <div className="border-2 border-black bg-[#fffdf5] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="border-b-2 border-black px-4 py-2.5 bg-[#f4eed9] flex items-center justify-between">
              <h3 className="font-mono text-xs font-black uppercase tracking-wider text-black">
                Kiểm Tra Tiêu Chuẩn (Validation)
              </h3>
              <span className="text-xs font-bold font-mono">
                {isValid && !isIdDuplicate
                  ? '100% ĐẠT CHUẨN'
                  : `${validationErrors.length + (syntaxError ? 1 : 0) + (isIdDuplicate ? 1 : 0)} LỖI CẦN XỬ LÝ`}
              </span>
            </div>

            <div className="p-4 space-y-3">
              {syntaxError && (
                <div className="border-2 border-black bg-red-100 p-3 space-y-1">
                  <div className="font-bold text-xs text-red-950 flex items-center gap-1.5">
                    <IconAlert className="w-4 h-4 text-red-700" />
                    <span>Lỗi cú pháp JSON (Syntax Error)</span>
                  </div>
                  <p className="text-xs font-mono text-red-900 wrap-break-word">{syntaxError}</p>
                </div>
              )}

              {isIdDuplicate && (
                <div className="border-2 border-black bg-amber-100 p-3 space-y-1">
                  <div className="font-bold text-xs text-amber-950 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <IconAlert className="w-4 h-4 text-amber-800" />
                      <span>Trùng mã ID đề thi: &quot;{parsedDoc?.id}&quot;</span>
                    </div>
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
                      className="text-xs font-black underline hover:text-black cursor-pointer"
                    >
                      Tự động tăng số đuôi &rarr;
                    </button>
                  </div>
                  <p className="text-xs text-amber-900 font-medium">
                    Hệ thống đã có bài thi với ID này. Hãy đổi sang số đuôi kế tiếp để lưu bài thi mới.
                  </p>
                </div>
              )}

              {validationErrors.length > 0 && (
                <div className="border-2 border-black bg-amber-50 p-3 space-y-2">
                  <div className="font-bold text-xs text-amber-950 flex items-center gap-1.5 border-b border-amber-900/20 pb-1">
                    <IconAlert className="w-4 h-4 text-amber-800" />
                    <span>Cần khắc phục {validationErrors.length} điểm chưa đạt chuẩn:</span>
                  </div>
                  <ul className="text-xs text-amber-900 space-y-1.5 max-h-56 overflow-y-auto pr-1 list-disc list-inside">
                    {validationErrors.map((err, idx) => (
                      <li key={idx} className="font-medium leading-snug">
                        <span className="font-mono text-[11px] bg-amber-100 px-1 py-0.5 border border-amber-300 mr-1">
                          {err.includes(':') ? err.split(':')[0] : 'Quy chuẩn'}
                        </span>
                        <span>{err.includes(':') ? err.split(':').slice(1).join(':') : err}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {isValid && !isIdDuplicate && (
                <div className="border-2 border-black bg-emerald-50 p-3 flex items-start gap-2.5">
                  <div className="w-5 h-5 bg-emerald-600 text-[#fffdf5] flex items-center justify-center shrink-0 border border-black font-bold">
                    <IconCheck className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="font-black text-emerald-950 text-xs">Cấu trúc đề thi hoàn hảo!</h4>
                    <p className="text-xs font-medium text-emerald-900 mt-0.5 leading-relaxed">
                      Đầy đủ 4 kỹ năng, các câu hỏi có mã ID độc nhất, đáp án chuẩn xác và mã đề thi chưa bị trùng. Bạn có thể nhấn &quot;Lưu Đề Thi Vào Hệ Thống&quot;.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Test Document Detailed Review Section */}
          <div className="border-2 border-black bg-[#fffdf5] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="border-b-2 border-black px-4 py-2.5 bg-[#f4eed9] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-mono text-xs font-black uppercase tracking-wider text-black">
                  Chi Tiết & Xem Trước Đề Thi
                </h3>
                {parsedDoc?.id && (
                  <span className="text-[11px] font-mono font-bold bg-black text-[#fffdf5] px-1.5 py-0.5">
                    ID: {parsedDoc.id}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsWidePreview(!isWidePreview)}
                className="text-xs font-bold text-neutral-800 hover:text-black underline cursor-pointer"
                title="Bật/Tắt chế độ xem toàn màn hình cho phần Preview"
              >
                {isWidePreview ? 'Thu hẹp (2 cột)' : 'Mở rộng toàn màn hình'}
              </button>
            </div>

            {parsedDoc ? (
              <div className="p-4 space-y-4">
                {/* Meta details */}
                <div className="space-y-1.5 border-b border-neutral-300 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-base sm:text-lg font-black text-black leading-snug">
                      {parsedDoc.title || <span className="text-neutral-400 italic">Chưa có tiêu đề bài thi</span>}
                    </h4>
                  </div>
                  <p className="text-xs font-medium text-neutral-800 leading-relaxed">
                    {parsedDoc.description || <span className="text-neutral-400 italic">Chưa có mô tả bài thi</span>}
                  </p>
                </div>

                {/* Metrics Breakdown Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono text-xs">
                  <div className="border-2 border-black p-2 bg-[#fffdf5]">
                    <div className="font-black text-lg">{readingQuestionCount}</div>
                    <div className="text-[10px] uppercase font-bold text-neutral-700">Reading ({readingPassageCount} bài)</div>
                  </div>
                  <div className="border-2 border-black p-2 bg-[#fffdf5]">
                    <div className="font-black text-lg">{listeningQuestionCount}</div>
                    <div className="text-[10px] uppercase font-bold text-neutral-700">Listening ({listeningPartCount} phần)</div>
                  </div>
                  <div className="border-2 border-black p-2 bg-[#fffdf5]">
                    <div className="font-black text-lg">{speakingTaskCount}</div>
                    <div className="text-[10px] uppercase font-bold text-neutral-700">Speaking Tasks</div>
                  </div>
                  <div className="border-2 border-black p-2 bg-[#fffdf5]">
                    <div className="font-black text-lg">{writingTaskCount}</div>
                    <div className="text-[10px] uppercase font-bold text-neutral-700">Writing Tasks</div>
                  </div>
                </div>

                {/* Section Review Tabs */}
                <div className="space-y-3 pt-2 border-t border-neutral-300">
                  <div className="flex items-center gap-1 border-b-2 border-black pb-1 overflow-x-auto text-xs">
                    {(
                      [
                        { id: 'overview', label: 'Tổng quan' },
                        { id: 'reading', label: `Reading (${readingQuestionCount})` },
                        { id: 'listening', label: `Listening (${listeningQuestionCount})` },
                        { id: 'speaking', label: `Speaking (${speakingTaskCount})` },
                        { id: 'writing', label: `Writing (${writingTaskCount})` },
                        { id: 'answers', label: `Bảng đáp án (${totalQuestions})` },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActivePreviewTab(tab.id)}
                        className={`px-2.5 py-1.5 font-bold transition-colors cursor-pointer border-2 shrink-0 ${activePreviewTab === tab.id
                          ? 'bg-black text-[#fffdf5] border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                          : 'bg-[#fffdf5] text-black border-transparent hover:border-black hover:bg-[#f4eed9]'
                          }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Tab 1: Overview */}
                  {activePreviewTab === 'overview' && (
                    <div className="space-y-3 text-xs">
                      <div className="border-2 border-black p-3 bg-[#fbf9f0] space-y-1.5 font-mono text-[11px]">
                        <div><strong>Schema Version:</strong> {parsedDoc.schemaVersion || '1.0'}</div>
                        <div><strong>Mã đề thi (ID):</strong> {parsedDoc.id || 'N/A'}</div>
                        <div><strong>Tổng số câu hỏi khách quan (Reading + Listening):</strong> {totalQuestions} câu</div>
                        <div><strong>Tổng số bài thực hành mở (Speaking + Writing):</strong> {speakingTaskCount + writingTaskCount} bài</div>
                      </div>

                      <div className="space-y-2">
                        <h5 className="font-black text-xs uppercase tracking-wider text-black">
                          Cấu Trúc Các Phần Trong Đề Thi:
                        </h5>
                        <div className="space-y-1.5 text-xs">
                          <div className="p-2 border border-black bg-[#fffdf5] flex items-center justify-between">
                            <span className="font-bold">1. Reading Section</span>
                            <span className="font-mono text-neutral-700">
                              {readingPassageCount} bài đọc &bull; {readingQuestionCount} câu hỏi
                            </span>
                          </div>
                          <div className="p-2 border border-black bg-[#fffdf5] flex items-center justify-between">
                            <span className="font-bold">2. Listening Section</span>
                            <span className="font-mono text-neutral-700">
                              {listeningPartCount} phần nghe &bull; {listeningQuestionCount} câu hỏi
                            </span>
                          </div>
                          <div className="p-2 border border-black bg-[#fffdf5] flex items-center justify-between">
                            <span className="font-bold">3. Speaking Section</span>
                            <span className="font-mono text-neutral-700">
                              {speakingTaskCount} bài nói thực hành
                            </span>
                          </div>
                          <div className="p-2 border border-black bg-[#fffdf5] flex items-center justify-between">
                            <span className="font-bold">4. Writing Section</span>
                            <span className="font-mono text-neutral-700">
                              {writingTaskCount} bài viết luận / phản hồi
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab 2: Reading Details */}
                  {activePreviewTab === 'reading' && (
                    <div className="space-y-4 max-h-136 overflow-y-auto pr-1">
                      {parsedDoc.sections?.reading?.instructions && (
                        <div className="p-2.5 bg-[#f4eed9] border border-black text-xs font-semibold">
                          <span className="font-bold">Hướng dẫn: </span>
                          <span>{parsedDoc.sections.reading.instructions}</span>
                        </div>
                      )}

                      {parsedDoc.sections?.reading?.passages?.map((passage: ReadingPassage, pIdx: number) => {
                        const isExpanded = Boolean(expandedPassageIds[passage.id || `p-${pIdx}`]);
                        const words = countWords(passage.content);

                        return (
                          <div key={passage.id || pIdx} className="border-2 border-black bg-[#fffdf5] p-3 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-black/20 pb-2">
                              <div>
                                <span className="font-mono text-[10px] uppercase font-bold bg-[#f4eed9] px-1.5 py-0.5 border border-black mr-2">
                                  Passage {pIdx + 1}
                                </span>
                                <span className="font-black text-sm text-black">{passage.title}</span>
                              </div>
                              <div className="flex items-center gap-2 font-mono text-[11px] text-neutral-600">
                                <span>ID: {passage.id}</span>
                                <span>&bull;</span>
                                <span>~{words} từ</span>
                                <span>&bull;</span>
                                <span className="font-bold text-black">{passage.questions?.length || 0} câu hỏi</span>
                              </div>
                            </div>

                            {/* Passage Content Preview */}
                            <div className="border border-neutral-300 p-2.5 bg-[#fbf9f0] text-xs leading-relaxed space-y-2">
                              <p className={`whitespace-pre-wrap text-neutral-800 ${isExpanded ? '' : 'line-clamp-3'}`}>
                                {passage.content}
                              </p>
                              <button
                                type="button"
                                onClick={() => togglePassage(passage.id || `p-${pIdx}`)}
                                className="text-[11px] font-bold text-black underline hover:text-neutral-700 cursor-pointer"
                              >
                                {isExpanded ? 'Thu gọn bài đọc' : `Xem toàn bộ bài đọc (~${words} từ)`}
                              </button>
                            </div>

                            {/* Questions in Passage */}
                            <div className="space-y-3 pt-1">
                              <div className="text-xs font-black uppercase tracking-wider text-neutral-800">
                                Danh Sách Câu Hỏi ({passage.questions?.length || 0} câu):
                              </div>
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
                    <div className="space-y-4 max-h-136 overflow-y-auto pr-1">
                      {parsedDoc.sections?.listening?.instructions && (
                        <div className="p-2.5 bg-[#f4eed9] border border-black text-xs font-semibold">
                          <span className="font-bold">Hướng dẫn: </span>
                          <span>{parsedDoc.sections.listening.instructions}</span>
                        </div>
                      )}

                      {parsedDoc.sections?.listening?.parts?.map((part: ListeningPart, partIdx: number) => {
                        const isTranscriptExpanded = Boolean(expandedTranscriptIds[part.id || `part-${partIdx}`]);
                        const transcriptWords = countWords(part.transcript);

                        return (
                          <div key={part.id || partIdx} className="border-2 border-black bg-[#fffdf5] p-3 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-black/20 pb-2">
                              <div>
                                <span className="font-mono text-[10px] uppercase font-bold bg-[#f4eed9] px-1.5 py-0.5 border border-black mr-2">
                                  Part {partIdx + 1}
                                </span>
                                <span className="font-black text-sm text-black">{part.title}</span>
                              </div>
                              <div className="flex items-center gap-2 font-mono text-[11px] text-neutral-600">
                                <span>ID: {part.id}</span>
                                <span>&bull;</span>
                                <span className="font-bold text-black">{part.questions?.length || 0} câu hỏi</span>
                              </div>
                            </div>

                            {/* Audio Config & Speakers */}
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono">
                              {part.audioConfig?.scenario && (
                                <span className="border border-black bg-[#fffdf5] px-2 py-0.5 font-bold">
                                  Ngữ cảnh: {part.audioConfig.scenario}
                                </span>
                              )}
                              {part.audioConfig?.accent && (
                                <span className="border border-black bg-[#fffdf5] px-2 py-0.5">
                                  Accent: {part.audioConfig.accent}
                                </span>
                              )}
                              {part.audioConfig?.pacing && (
                                <span className="border border-black bg-[#fffdf5] px-2 py-0.5">
                                  Nhịp điệu: {part.audioConfig.pacing}
                                </span>
                              )}
                              {part.speakers && part.speakers.length > 0 && (
                                <span className="border border-black bg-[#f4eed9] px-2 py-0.5 font-bold">
                                  Nhân vật: {part.speakers.map((s) => `${s.name} (${s.gender || 'm/f'})`).join(', ')}
                                </span>
                              )}
                              {part.audioUrl && (
                                <span className="border border-neutral-300 bg-neutral-100 px-2 py-0.5 text-neutral-600 truncate max-w-xs">
                                  File: {part.audioUrl}
                                </span>
                              )}
                            </div>

                            {/* Transcript Preview */}
                            {part.transcript && (
                              <div className="border border-neutral-300 p-2.5 bg-[#fbf9f0] text-xs leading-relaxed space-y-2">
                                <div className="font-bold text-[11px] uppercase tracking-wider text-neutral-700">
                                  Kịch Bản Âm Thanh (Transcript):
                                </div>
                                <p className={`whitespace-pre-wrap font-mono text-[11px] text-neutral-800 ${isTranscriptExpanded ? '' : 'line-clamp-3'}`}>
                                  {part.transcript}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => toggleTranscript(part.id || `part-${partIdx}`)}
                                  className="text-[11px] font-bold text-black underline hover:text-neutral-700 cursor-pointer"
                                >
                                  {isTranscriptExpanded ? 'Thu gọn kịch bản' : `Xem toàn bộ kịch bản (~${transcriptWords} từ)`}
                                </button>
                              </div>
                            )}

                            {/* Questions in Part */}
                            <div className="space-y-3 pt-1">
                              <div className="text-xs font-black uppercase tracking-wider text-neutral-800">
                                Danh Sách Câu Hỏi ({part.questions?.length || 0} câu):
                              </div>
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
                    <div className="space-y-4 max-h-136 overflow-y-auto pr-1">
                      {parsedDoc.sections?.speaking?.instructions && (
                        <div className="p-2.5 bg-[#f4eed9] border border-black text-xs font-semibold">
                          <span className="font-bold">Hướng dẫn: </span>
                          <span>{parsedDoc.sections.speaking.instructions}</span>
                        </div>
                      )}

                      {parsedDoc.sections?.speaking?.tasks?.map((task: SpeakingTask, tIdx: number) => {
                        const isSampleExpanded = Boolean(expandedSampleIds[task.id || `spk-${tIdx}`]);

                        return (
                          <div key={task.id || tIdx} className="border-2 border-black bg-[#fffdf5] p-3.5 space-y-3">
                            <div className="flex items-center justify-between border-b border-black/20 pb-2">
                              <div>
                                <span className="font-mono text-[10px] uppercase font-bold bg-[#f4eed9] px-1.5 py-0.5 border border-black mr-2">
                                  Task {tIdx + 1}
                                </span>
                                <span className="font-black text-sm text-black">{task.title}</span>
                              </div>
                              <span className="font-mono text-xs text-neutral-600">ID: {task.id}</span>
                            </div>

                            <div className="p-3 bg-[#fbf9f0] border border-black text-xs leading-relaxed space-y-1">
                              <div className="font-black text-[11px] uppercase tracking-wider text-neutral-700">
                                Đề Bài & Yêu Cầu Nói (Prompt):
                              </div>
                              <p className="font-semibold text-neutral-900 whitespace-pre-wrap">{task.prompt}</p>
                            </div>

                            {/* Rubrics */}
                            {task.rubric && task.rubric.length > 0 && (
                              <div className="space-y-1.5">
                                <div className="font-bold text-xs uppercase tracking-wider text-black">
                                  Tiêu Chí Chấm Điểm ({task.rubric.length} tiêu chí):
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                  {task.rubric.map((r, rIdx) => (
                                    <div key={rIdx} className="border border-black p-2 bg-[#fffdf5] space-y-0.5">
                                      <div className="font-black text-neutral-900">{r.criterion}</div>
                                      <div className="text-[11px] text-neutral-700">{r.description}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Sample Answer */}
                            {task.sampleAnswer && (
                              <div className="border border-neutral-300 p-2.5 bg-[#fffdf5] text-xs space-y-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleSample(task.id || `spk-${tIdx}`)}
                                  className="font-bold text-[11px] text-black underline cursor-pointer"
                                >
                                  {isSampleExpanded ? 'Thu gọn câu trả lời mẫu' : 'Xem câu trả lời mẫu (Sample Answer)'}
                                </button>
                                {isSampleExpanded && (
                                  <p className="whitespace-pre-wrap text-neutral-800 italic pt-1 border-t border-neutral-200">
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
                    <div className="space-y-4 max-h-136 overflow-y-auto pr-1">
                      {parsedDoc.sections?.writing?.instructions && (
                        <div className="p-2.5 bg-[#f4eed9] border border-black text-xs font-semibold">
                          <span className="font-bold">Hướng dẫn: </span>
                          <span>{parsedDoc.sections.writing.instructions}</span>
                        </div>
                      )}

                      {parsedDoc.sections?.writing?.tasks?.map((task: WritingTask, tIdx: number) => {
                        const isSampleExpanded = Boolean(expandedSampleIds[task.id || `wrt-${tIdx}`]);

                        return (
                          <div key={task.id || tIdx} className="border-2 border-black bg-[#fffdf5] p-3.5 space-y-3">
                            <div className="flex items-center justify-between border-b border-black/20 pb-2">
                              <div>
                                <span className="font-mono text-[10px] uppercase font-bold bg-[#f4eed9] px-1.5 py-0.5 border border-black mr-2">
                                  Task {tIdx + 1}
                                </span>
                                <span className="font-black text-sm text-black">{task.title}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {task.minWords && (
                                  <span className="border-2 border-black bg-amber-100 text-amber-950 px-2 py-0.5 font-mono text-[11px] font-bold">
                                    Tối thiểu {task.minWords} từ
                                  </span>
                                )}
                                <span className="font-mono text-xs text-neutral-600">ID: {task.id}</span>
                              </div>
                            </div>

                            <div className="p-3 bg-[#fbf9f0] border border-black text-xs leading-relaxed space-y-1">
                              <div className="font-black text-[11px] uppercase tracking-wider text-neutral-700">
                                Đề Bài & Yêu Cầu Viết (Prompt):
                              </div>
                              <p className="font-semibold text-neutral-900 whitespace-pre-wrap">{task.prompt}</p>
                            </div>

                            {/* Rubrics */}
                            {task.rubric && task.rubric.length > 0 && (
                              <div className="space-y-1.5">
                                <div className="font-bold text-xs uppercase tracking-wider text-black">
                                  Tiêu Chí Chấm Điểm ({task.rubric.length} tiêu chí):
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                  {task.rubric.map((r, rIdx) => (
                                    <div key={rIdx} className="border border-black p-2 bg-[#fffdf5] space-y-0.5">
                                      <div className="font-black text-neutral-900">{r.criterion}</div>
                                      <div className="text-[11px] text-neutral-700">{r.description}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Sample Answer */}
                            {task.sampleAnswer && (
                              <div className="border border-neutral-300 p-2.5 bg-[#fffdf5] text-xs space-y-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleSample(task.id || `wrt-${tIdx}`)}
                                  className="font-bold text-[11px] text-black underline cursor-pointer"
                                >
                                  {isSampleExpanded ? 'Thu gọn bài viết mẫu' : 'Xem bài viết mẫu (Sample Answer)'}
                                </button>
                                {isSampleExpanded && (
                                  <p className="whitespace-pre-wrap text-neutral-800 italic pt-1 border-t border-neutral-200">
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
                    <div className="space-y-3 max-h-136 overflow-y-auto pr-1">
                      <div className="flex items-center justify-between text-xs font-semibold text-neutral-700 border-b border-black pb-1">
                        <span>Bảng đối chiếu toàn bộ đáp án chuẩn của đề thi:</span>
                        <span className="font-mono font-bold text-black">{answerKeyMatrix.length} câu hỏi</span>
                      </div>

                      <div className="border-2 border-black overflow-x-auto bg-[#fffdf5]">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b-2 border-black bg-[#f4eed9] font-mono text-[11px] text-black">
                              <th className="p-2 border-r border-black w-12 text-center">STT</th>
                              <th className="p-2 border-r border-black">Phần / Bài</th>
                              <th className="p-2 border-r border-black">Mã Câu (ID)</th>
                              <th className="p-2 border-r border-black">Dạng Câu</th>
                              <th className="p-2 border-r border-black font-bold">Đáp Án Chuẩn</th>
                              <th className="p-2 text-center w-24">Giải Thích</th>
                            </tr>
                          </thead>
                          <tbody>
                            {answerKeyMatrix.map((item) => (
                              <tr key={item.id} className="border-b border-neutral-300 hover:bg-[#fbf9f0]">
                                <td className="p-2 border-r border-black font-mono text-center font-bold">
                                  {item.stt}
                                </td>
                                <td className="p-2 border-r border-black font-semibold">
                                  {item.section} - {item.partName}
                                </td>
                                <td className="p-2 border-r border-black font-mono text-xs">
                                  {item.id}
                                </td>
                                <td className="p-2 border-r border-black text-[11px] text-neutral-700">
                                  {getQuestionTypeLabel(item.type)}
                                </td>
                                <td className="p-2 border-r border-black font-mono font-black text-emerald-900 bg-emerald-50">
                                  {item.correctAnswer}
                                </td>
                                <td className="p-2 text-center font-mono text-[11px]">
                                  {item.hasExplanation ? (
                                    <span className="text-emerald-700 font-bold">Có</span>
                                  ) : (
                                    <span className="text-neutral-400">Không</span>
                                  )}
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
              <div className="p-8 text-center text-neutral-500 font-mono text-xs">
                Chưa có dữ liệu đề thi hợp lệ để hiển thị xem trước.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Modal when ID collides */}
      {conflictModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="border-2 border-black bg-[#fffdf5] max-w-lg w-full p-5 sm:p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-3 border-b-2 border-black pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-amber-100 border-2 border-black flex items-center justify-center shrink-0">
                  <IconAlert className="w-5 h-5 text-amber-900" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-black">
                    Trùng Mã Đề Thi (ID Đã Tồn Tại)
                  </h3>
                  <span className="text-xs font-mono font-bold text-neutral-600">
                    Chính sách: Không cho phép ghi đè bài thi cũ
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConflictModal(null)}
                className="p-1 hover:bg-neutral-200 border border-black cursor-pointer"
                title="Đóng hộp thoại"
              >
                <IconX className="w-4 h-4 text-black" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs sm:text-sm text-neutral-800 leading-relaxed">
              <p>
                Mã đề thi{' '}
                <code className="bg-amber-100 px-1.5 py-0.5 border border-black font-mono font-bold text-black">
                  {conflictModal.currentId}
                </code>{' '}
                đã tồn tại trong kho đề thi của hệ thống. Hệ thống không cho phép ghi đè để bảo vệ bài thi đã có.
              </p>
              <p className="font-semibold text-neutral-900">
                Bạn có muốn hệ thống tự động đổi mã ID thành số đuôi kế tiếp sau đây không?
              </p>
              <div className="p-3 bg-[#f4eed9] border-2 border-black font-mono font-black text-base text-black text-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                {conflictModal.suggestedId}
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 border-t border-neutral-300">
              <button
                type="button"
                onClick={() => setConflictModal(null)}
                className="border-2 border-black px-3 py-2 bg-[#fffdf5] text-black font-bold text-xs sm:text-sm hover:bg-[#f4eed9] transition-colors cursor-pointer text-center"
              >
                Hủy / Tự sửa thủ công
              </button>
              <button
                type="button"
                onClick={() => handleApplyNewId(conflictModal.suggestedId, false)}
                className="border-2 border-black px-3 py-2 bg-[#f4eed9] text-black font-bold text-xs sm:text-sm hover:bg-black hover:text-[#fffdf5] transition-colors cursor-pointer text-center"
              >
                Chỉ cập nhật mã vào JSON
              </button>
              <button
                type="button"
                onClick={() => handleApplyNewId(conflictModal.suggestedId, true)}
                className="border-2 border-black px-4 py-2 bg-black text-[#fffdf5] font-black text-xs sm:text-sm hover:bg-[#fffdf5] hover:text-black transition-colors cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-center"
              >
                Đổi sang {conflictModal.suggestedId} & Lưu ngay
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
    <div className="border border-black p-3 bg-[#fffdf5] space-y-2 text-xs">
      {/* Question Header */}
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-neutral-200 pb-1.5">
        <div className="flex items-center gap-2">
          <span className="font-black text-black">Câu {index + 1}</span>
          <span className="font-mono text-[11px] bg-neutral-100 border border-neutral-300 px-1 py-0.5 text-neutral-700">
            {question.id}
          </span>
        </div>
        <span className="font-mono text-[10px] uppercase font-bold bg-[#f4eed9] border border-black px-1.5 py-0.5">
          {getQuestionTypeLabel(question.type)}
        </span>
      </div>

      {/* Prompt */}
      <div className="font-semibold text-neutral-900 leading-snug">
        {question.prompt}
      </div>

      {/* Answer Options & Correct Answer Highlighting */}
      <div className="space-y-1 pt-1">
        {question.type === 'multiple_choice' && (
          <div className="space-y-1">
            {question.options?.map((opt) => {
              const isCorrect = opt.id === question.correctAnswer;
              return (
                <div
                  key={opt.id}
                  className={`p-1.5 border flex items-center justify-between gap-2 text-xs transition-colors ${isCorrect
                    ? 'bg-emerald-50 border-emerald-700 text-emerald-950 font-bold'
                    : 'bg-[#fffdf5] border-neutral-300 text-neutral-800'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold w-5">{opt.id}.</span>
                    <span>{opt.text}</span>
                  </div>
                  {isCorrect && (
                    <span className="shrink-0 font-mono text-[10px] font-black uppercase bg-emerald-600 text-[#fffdf5] px-1.5 py-0.5">
                      Đáp án đúng
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {question.type === 'multiple_select' && (
          <div className="space-y-1">
            {question.options?.map((opt) => {
              const isCorrect = question.correctAnswers?.includes(opt.id);
              return (
                <div
                  key={opt.id}
                  className={`p-1.5 border flex items-center justify-between gap-2 text-xs transition-colors ${isCorrect
                    ? 'bg-emerald-50 border-emerald-700 text-emerald-950 font-bold'
                    : 'bg-[#fffdf5] border-neutral-300 text-neutral-800'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold w-5">{opt.id}.</span>
                    <span>{opt.text}</span>
                  </div>
                  {isCorrect && (
                    <span className="shrink-0 font-mono text-[10px] font-black uppercase bg-emerald-600 text-[#fffdf5] px-1.5 py-0.5">
                      Đáp án đúng
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {question.type === 'fill_blank' && (
          <div className="p-2 border border-black bg-emerald-50 text-emerald-950 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[11px] uppercase tracking-wider">
                Các đáp án được chấp nhận:
              </span>
              <span className="font-mono text-[10px] text-neutral-600">
                Phân biệt hoa/thường: {question.caseSensitive ? 'Có' : 'Không'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {question.acceptedAnswers?.map((ans, aIdx) => (
                <span
                  key={aIdx}
                  className="font-mono font-black text-xs bg-[#fffdf5] border border-emerald-700 px-2 py-0.5 text-black"
                >
                  &quot;{ans}&quot;
                </span>
              ))}
            </div>
          </div>
        )}

        {question.type === 'true_false_ng' && (
          <div className="flex items-center gap-2 pt-1 font-mono text-xs">
            {(['TRUE', 'FALSE', 'NOT_GIVEN'] as const).map((choice) => {
              const isCorrect = choice === question.correctAnswer;
              return (
                <div
                  key={choice}
                  className={`px-3 py-1 border text-center font-bold ${isCorrect
                    ? 'bg-emerald-600 text-[#fffdf5] border-black font-black'
                    : 'bg-[#fffdf5] text-neutral-700 border-neutral-300'
                    }`}
                >
                  {choice}
                  {isCorrect && ' (Đúng)'}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Explanation */}
      {question.explanation && (
        <div className="p-2 bg-[#fbf9f0] border-l-4 border-amber-500 text-[11px] text-neutral-800 leading-snug">
          <span className="font-bold text-neutral-900">Giải thích: </span>
          <span>{question.explanation}</span>
        </div>
      )}
    </div>
  );
};
