import React from 'react';
import { Check as IconCheck } from 'lucide-react';
import type { TestDocument } from '@/types/test';

interface ValidationFeedbackProps {
  syntaxError: string | null;
  validationErrors: string[];
  isIdDuplicate: boolean;
  isValid: boolean;
  parsedDoc: TestDocument | null;
  onOpenConflictModal: () => void;
}

export const ValidationFeedback: React.FC<ValidationFeedbackProps> = ({
  syntaxError,
  validationErrors,
  isIdDuplicate,
  isValid,
  parsedDoc,
  onOpenConflictModal,
}) => {
  const errorCount =
    validationErrors.length + (syntaxError ? 1 : 0) + (isIdDuplicate ? 1 : 0);

  return (
    <div className="border-2 border-black bg-[#fffdf5] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
      <div className="border-b border-black px-3 py-2 bg-[#f4eed9] flex items-center justify-between text-xs font-mono">
        <h3 className="font-bold text-black">Kiểm tra</h3>
        <span className="text-neutral-600 font-semibold">
          {isValid && !isIdDuplicate ? 'Hợp lệ' : `${errorCount} lỗi`}
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
              onClick={onOpenConflictModal}
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
  );
};
