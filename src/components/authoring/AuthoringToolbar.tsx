import React from 'react';
import {
  Upload as IconUpload,
  FileCode as IconTemplate,
  Sparkles as IconPrettify,
  Download as IconDownload,
  Copy as IconCopy,
  Check as IconCheck,
} from 'lucide-react';

interface AuthoringToolbarProps {
  syntaxError: string | null;
  validationCount: number;
  isIdDuplicate: boolean;
  isValid: boolean;
  isCopyingDoc: 'cefr' | 'hsk' | null;
  copiedDocType: 'cefr' | 'hsk' | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLoadTemplate: () => void;
  onPrettify: () => void;
  onDownload: () => void;
  onCopyDoc: (type: 'cefr' | 'hsk') => void;
}

export const AuthoringToolbar: React.FC<AuthoringToolbarProps> = ({
  syntaxError,
  validationCount,
  isIdDuplicate,
  isCopyingDoc,
  copiedDocType,
  fileInputRef,
  onFileUpload,
  onLoadTemplate,
  onPrettify,
  onDownload,
  onCopyDoc,
}) => {
  return (
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
          ) : validationCount > 0 ? (
            <span className="border border-amber-700 bg-amber-100 text-amber-950 px-2 py-0.5 text-xs font-bold">
              Chưa đạt ({validationCount})
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

      <div className="pt-2 border-t border-neutral-200 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileUpload}
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
            onClick={onLoadTemplate}
            className="border border-black px-2.5 py-1 bg-[#fffdf5] text-black font-semibold text-xs hover:bg-[#f4eed9] transition-colors cursor-pointer flex items-center gap-1"
          >
            <IconTemplate className="w-3.5 h-3.5 shrink-0" />
            <span>Đề mẫu</span>
          </button>

          <button
            type="button"
            onClick={onPrettify}
            disabled={Boolean(syntaxError)}
            className="border border-black px-2.5 py-1 bg-[#fffdf5] text-black font-semibold text-xs hover:bg-[#f4eed9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1"
          >
            <IconPrettify className="w-3.5 h-3.5 shrink-0" />
            <span>Format</span>
          </button>

          <button
            type="button"
            onClick={onDownload}
            className="border border-black px-2.5 py-1 bg-[#fffdf5] text-black font-semibold text-xs hover:bg-[#f4eed9] transition-colors cursor-pointer flex items-center gap-1"
          >
            <IconDownload className="w-3.5 h-3.5 shrink-0" />
            <span>Tải về</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider hidden sm:inline">
            Tài liệu hướng dẫn:
          </span>

          <button
            type="button"
            onClick={() => onCopyDoc('cefr')}
            disabled={Boolean(isCopyingDoc)}
            className="border border-black px-2.5 py-1 bg-[#fffdf5] text-black font-semibold text-xs hover:bg-[#f4eed9] transition-colors cursor-pointer flex items-center gap-1.5"
            title="Sao chép toàn bộ hướng dẫn quy chuẩn CEFR (test-authoring-guide.md)"
          >
            {copiedDocType === 'cefr' ? (
              <>
                <IconCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0 stroke-[2.5]" />
                <span className="text-emerald-800 font-bold">Đã chép CEFR Guide</span>
              </>
            ) : (
              <>
                <IconCopy className="w-3.5 h-3.5 shrink-0 text-neutral-600" />
                <span>Copy CEFR Guide</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onCopyDoc('hsk')}
            disabled={Boolean(isCopyingDoc)}
            className="border border-black px-2.5 py-1 bg-[#fffdf5] text-black font-semibold text-xs hover:bg-[#f4eed9] transition-colors cursor-pointer flex items-center gap-1.5"
            title="Sao chép toàn bộ hướng dẫn quy chuẩn HSK (hsk-test-authoring-guide.md)"
          >
            {copiedDocType === 'hsk' ? (
              <>
                <IconCheck className="w-3.5 h-3.5 text-emerald-700 shrink-0 stroke-[2.5]" />
                <span className="text-emerald-800 font-bold">Đã chép HSK Guide</span>
              </>
            ) : (
              <>
                <IconCopy className="w-3.5 h-3.5 shrink-0 text-neutral-600" />
                <span>Copy HSK Guide</span>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
};
