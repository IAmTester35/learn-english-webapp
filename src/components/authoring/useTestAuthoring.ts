import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { TestDocument, TestCatalog } from '@/types/test';
import { validateTestDocument } from '@/domain/validator';
import { SAMPLE_TEST_TEMPLATE } from '@/services/testTemplate';

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

export function useTestAuthoring() {
  const router = useRouter();

  const [jsonText, setJsonText] = useState<string>(() =>
    JSON.stringify(SAMPLE_TEST_TEMPLATE, null, 2)
  );
  const [existingIds, setExistingIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<{ id: string; message: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [conflictModal, setConflictModal] = useState<{
    currentId: string;
    suggestedId: string;
  } | null>(null);

  const [copiedDocType, setCopiedDocType] = useState<'cefr' | 'hsk' | null>(null);
  const [isCopyingDoc, setIsCopyingDoc] = useState<'cefr' | 'hsk' | null>(null);
  const [activeTtsModalTestId, setActiveTtsModalTestId] = useState<string | null>(null);

  // Fetch catalog on mount to know existing test IDs, and load target test if ?edit=<id>
  useEffect(() => {
    let isMounted = true;
    async function loadCatalogAndEditTarget() {
      try {
        const res = await fetch('/api/tests?admin=true');
        if (res.ok) {
          const catalog: TestCatalog = await res.json();
          if (isMounted && catalog && Array.isArray(catalog.tests)) {
            setExistingIds(catalog.tests.map((t) => t.id));
          }
        }

        const params = new URLSearchParams(window.location.search);
        const editId = params.get('edit');
        if (editId && editId.trim()) {
          const editRes = await fetch(`/api/tests?id=${encodeURIComponent(editId.trim())}`);
          if (editRes.ok) {
            const editData = await editRes.json();
            if (isMounted && editData?.test) {
              setJsonText(JSON.stringify(editData.test, null, 2));
            }
          }
        }
      } catch {
        // Fallback silently if offline or catalog not ready
      }
    }
    loadCatalogAndEditTarget();
    return () => {
      isMounted = false;
    };
  }, []);

  // Real-time validation via derived state
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

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, []);

  const handlePrettify = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(parsed, null, 2));
      setSaveError(null);
    } catch (err) {
      setSaveError(`JSON lỗi cú pháp: ${err instanceof Error ? err.message : ''}`);
    }
  }, [jsonText]);

  const handleLoadTemplate = useCallback(() => {
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
  }, [jsonText]);

  const handleDownload = useCallback(() => {
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
  }, [jsonText, parsedDoc]);

  const handleCopyDoc = useCallback(async (type: 'cefr' | 'hsk') => {
    setIsCopyingDoc(type);
    try {
      const res = await fetch(`/api/docs?type=${type}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Lỗi khi tải tài liệu');
      }
      await navigator.clipboard.writeText(data.content);
      setCopiedDocType(type);
      setTimeout(() => {
        setCopiedDocType(null);
      }, 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Không thể sao chép tài liệu.');
    } finally {
      setIsCopyingDoc(null);
    }
  }, []);

  const executeSave = useCallback(
    async (docToSave: TestDocument, overwrite = false) => {
      setIsSaving(true);
      setSaveError(null);
      setSaveSuccess(null);

      try {
        const res = await fetch('/api/tests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ test: docToSave, overwrite }),
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
        const hasListening = docToSave.sections?.listening?.parts?.some(
          (p) => p.transcript && p.transcript.trim().length > 0
        );
        if (hasListening) {
          setActiveTtsModalTestId(data.id || docToSave.id);
        }
        router.refresh();
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Lỗi khi lưu đề thi.');
      } finally {
        setIsSaving(false);
      }
    },
    [existingIds, router]
  );

  const handleSave = useCallback(async () => {
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
  }, [syntaxError, validationErrors, parsedDoc, existingIds, executeSave]);

  const handleApplyNewId = useCallback(
    async (newId: string, andSave: boolean) => {
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
    },
    [conflictModal, jsonText, parsedDoc, executeSave]
  );

  const isIdDuplicate = Boolean(parsedDoc?.id && existingIds.includes(parsedDoc.id));
  const isValid = !syntaxError && validationErrors.length === 0 && Boolean(parsedDoc?.id);

  return {
    jsonText,
    setJsonText,
    isSaving,
    saveSuccess,
    setSaveSuccess,
    saveError,
    setSaveError,
    conflictModal,
    setConflictModal,
    copiedDocType,
    isCopyingDoc,
    activeTtsModalTestId,
    setActiveTtsModalTestId,
    syntaxError,
    validationErrors,
    parsedDoc,
    isIdDuplicate,
    isValid,
    handleFileUpload,
    handlePrettify,
    handleLoadTemplate,
    handleDownload,
    handleCopyDoc,
    handleSave,
    executeSave,
    handleApplyNewId,
  };
}
