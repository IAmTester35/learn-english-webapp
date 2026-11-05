import React from 'react';
import { X as IconX } from 'lucide-react';

interface IdConflictModalProps {
  currentId: string;
  suggestedId: string;
  onClose: () => void;
  onOverwrite: () => void;
  onApplyNewId: (newId: string, andSave: boolean) => void;
}

export const IdConflictModal: React.FC<IdConflictModalProps> = ({
  currentId,
  suggestedId,
  onClose,
  onOverwrite,
  onApplyNewId,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="border-2 border-black bg-[#fffdf5] max-w-md w-full p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-3">
        <div className="flex items-center justify-between border-b border-black pb-2">
          <h3 className="font-bold text-sm text-black">
            Trùng mã đề thi
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-neutral-200 cursor-pointer"
          >
            <IconX className="w-4 h-4 text-black" />
          </button>
        </div>

        <p className="text-xs text-neutral-800 leading-relaxed">
          Mã <code className="bg-amber-100 px-1 border border-black font-bold font-mono">{currentId}</code> đã tồn tại. Bạn muốn ghi đè (cập nhật) đề thi này hay tự động tăng mã sang <code className="bg-amber-200 px-1 border border-black font-bold font-mono">{suggestedId}</code>?
        </p>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-neutral-200">
          <button
            type="button"
            onClick={onClose}
            className="border border-black px-2.5 py-1 bg-[#fffdf5] text-black text-xs font-semibold cursor-pointer"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onOverwrite}
            className="border border-black px-2.5 py-1 bg-[#e6f4ea] text-[#137333] text-xs font-bold cursor-pointer"
          >
            Ghi đè (Cập nhật)
          </button>
          <button
            type="button"
            onClick={() => onApplyNewId(suggestedId, false)}
            className="border border-black px-2.5 py-1 bg-[#f4eed9] text-black text-xs font-bold cursor-pointer"
          >
            Đổi mã
          </button>
          <button
            type="button"
            onClick={() => onApplyNewId(suggestedId, true)}
            className="border border-black px-3 py-1 bg-black text-[#fffdf5] text-xs font-bold cursor-pointer"
          >
            Đổi &amp; Lưu mới
          </button>
        </div>
      </div>
    </div>
  );
};
