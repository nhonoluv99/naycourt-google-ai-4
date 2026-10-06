interface UnsavedConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message?: string;
  onSaveAndProceed: () => void;
  onDiscardAndProceed: () => void;
  onCancel: () => void;
  saveButtonText?: string;
  discardButtonText?: string;
}

export function UnsavedConfirmDialog({
  isOpen,
  title = "Bạn có thay đổi chưa lưu",
  message = "Giải đấu hiện tại có các chỉnh sửa chưa được lưu. Bạn có muốn lưu lại trước khi tiếp tục không?",
  onSaveAndProceed,
  onDiscardAndProceed,
  onCancel,
  saveButtonText = "Lưu & Tiếp tục",
  discardButtonText = "Không lưu",
}: UnsavedConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-line/20 bg-card p-5 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-amber-500/15 text-amber-600 text-lg">
            ⚠️
          </div>
          <div>
            <h4
              className="text-base font-bold text-ink"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {title}
            </h4>
            <p className="text-xs text-line/65 mt-0.5">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line/10">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-3 py-2 text-xs font-bold text-line/70 hover:bg-secondary transition cursor-pointer"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onDiscardAndProceed}
            className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-500/20 transition cursor-pointer"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {discardButtonText}
          </button>
          <button
            type="button"
            onClick={onSaveAndProceed}
            className="rounded-xl bg-[#0a3320] px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-[#0a3320]/90 transition cursor-pointer"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            {saveButtonText}
          </button>
        </div>
      </div>
    </div>
  );
}
