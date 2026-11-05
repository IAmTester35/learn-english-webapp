import React from 'react';

interface JsonCodeEditorProps {
  textareaId: string;
  jsonText: string;
  onChangeText: (value: string) => void;
  onClear: () => void;
  onSave: () => void;
  isValid: boolean;
  isSaving: boolean;
}

export const JsonCodeEditor: React.FC<JsonCodeEditorProps> = ({
  textareaId,
  jsonText,
  onChangeText,
  onClear,
  onSave,
  isValid,
  isSaving,
}) => {
  return (
    <div className="border-2 border-black bg-[#fffdf5] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex flex-col">
      <div className="border-b border-black px-3 py-2 bg-[#f4eed9] flex items-center justify-between text-xs">
        <label
          htmlFor={textareaId}
          className="font-mono font-bold text-black cursor-pointer"
        >
          JSON ({jsonText.split('\n').length} dòng)
        </label>

        <button
          type="button"
          onClick={onClear}
          className="text-neutral-600 hover:text-black underline cursor-pointer"
        >
          Xóa trắng
        </button>
      </div>

      <div className="p-2.5 bg-[#fbf9f0]">
        <textarea
          id={textareaId}
          value={jsonText}
          onChange={(e) => onChangeText(e.target.value)}
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
          onClick={onSave}
          disabled={!isValid || isSaving}
          className="border-2 border-black px-4 py-2 bg-black text-[#fffdf5] font-bold text-xs sm:text-sm hover:bg-[#fffdf5] hover:text-black disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
        >
          {isSaving ? 'Đang lưu...' : 'Lưu đề thi'}
        </button>
      </div>
    </div>
  );
};
