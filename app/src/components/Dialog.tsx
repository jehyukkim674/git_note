import { useEffect, useState } from "react";

interface Props {
  title: string;
  /// "input"이면 텍스트 입력, "confirm"이면 확인/취소.
  mode: "input" | "confirm";
  initial?: string;
  message?: string;
  confirmLabel?: string;
  /// 되돌릴 수 없는 작업(삭제 등)이면 확인 버튼을 빨간색으로.
  danger?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function Dialog({
  title,
  mode,
  initial = "",
  message,
  confirmLabel = "확인",
  danger = false,
  onSubmit,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initial);

  // 24. confirm 모드에서도 Escape로 닫기 / Enter로 확인
  useEffect(() => {
    if (mode !== "confirm") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onSubmit(value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, value, onSubmit, onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        {message && <p className="dim">{message}</p>}
        {mode === "input" && (
          <input
            className="text-input"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSubmit(value);
              if (e.key === "Escape") onCancel();
            }}
          />
        )}
        <div className="row-end">
          <button className="modal-close" onClick={onCancel}>
            취소
          </button>
          <button
            className={danger ? "danger" : undefined}
            autoFocus={mode === "confirm"}
            onClick={() => onSubmit(value)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
