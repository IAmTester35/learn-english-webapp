'use client';

import React, { useId, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check as IconCheck,
  AlertTriangle as IconAlert,
  X as IconX,
} from 'lucide-react';
import { TtsProgressModal } from './admin/TtsProgressModal';

import { useTestAuthoring } from './authoring/useTestAuthoring';
import { AuthoringToolbar } from './authoring/AuthoringToolbar';
import { JsonCodeEditor } from './authoring/JsonCodeEditor';
import { ValidationFeedback } from './authoring/ValidationFeedback';
import { TestPreviewPanel } from './authoring/TestPreviewPanel';
import { IdConflictModal } from './authoring/IdConflictModal';

export const TestAuthoringView: React.FC = () => {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonTextareaId = useId();

  const {
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
  } = useTestAuthoring();

  return (
    <div className="space-y-4 pb-12 w-full min-w-0 overflow-x-hidden">
      {/* Top Banner & Toolbar */}
      <AuthoringToolbar
        syntaxError={syntaxError}
        validationCount={validationErrors.length}
        isIdDuplicate={isIdDuplicate}
        isValid={isValid}
        isCopyingDoc={isCopyingDoc}
        copiedDocType={copiedDocType}
        fileInputRef={fileInputRef}
        onFileUpload={handleFileUpload}
        onLoadTemplate={handleLoadTemplate}
        onPrettify={handlePrettify}
        onDownload={handleDownload}
        onCopyDoc={handleCopyDoc}
      />

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
              className="p-1 hover:text-black cursor-pointer"
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
            className="p-1 text-red-800 hover:text-black shrink-0 cursor-pointer"
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Split Grid: Editor (Left) & Preview / Errors (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: JSON Code Editor */}
        <div className="lg:col-span-6 space-y-3">
          <JsonCodeEditor
            textareaId={jsonTextareaId}
            jsonText={jsonText}
            onChangeText={(val) => {
              setJsonText(val);
              setSaveSuccess(null);
              setSaveError(null);
            }}
            onClear={() => setJsonText('')}
            onSave={handleSave}
            isValid={isValid}
            isSaving={isSaving}
          />
        </div>

        {/* Right Column: Live Validation & Review */}
        <div className="lg:col-span-6 space-y-3">
          <ValidationFeedback
            syntaxError={syntaxError}
            validationErrors={validationErrors}
            isIdDuplicate={isIdDuplicate}
            isValid={isValid}
            parsedDoc={parsedDoc}
            onOpenConflictModal={() => {
              if (parsedDoc?.id) {
                setConflictModal({
                  currentId: parsedDoc.id,
                  suggestedId: parsedDoc.id,
                });
              }
            }}
          />

          <TestPreviewPanel parsedDoc={parsedDoc} />
        </div>
      </div>

      {/* Confirmation Modal when ID collides */}
      {conflictModal && (
        <IdConflictModal
          currentId={conflictModal.currentId}
          suggestedId={conflictModal.suggestedId}
          onClose={() => setConflictModal(null)}
          onOverwrite={() => {
            setConflictModal(null);
            if (parsedDoc) {
              void executeSave(parsedDoc, true);
            }
          }}
          onApplyNewId={handleApplyNewId}
        />
      )}

      {/* Visual TTS Progress Tracking Modal */}
      {activeTtsModalTestId && (
        <TtsProgressModal
          testId={activeTtsModalTestId}
          testTitle={parsedDoc?.title}
          onClose={() => setActiveTtsModalTestId(null)}
          onFinished={() => router.refresh()}
        />
      )}
    </div>
  );
};
