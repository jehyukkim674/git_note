import { useState } from "react";

interface Props {
  title: string;
  /// "input"이면 텍스트 입력, "confirm"이면 확인/취소.
  mode: "input" | "confirm";
  initial?: string;
  message?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function Dialog({
  title,
  mode,
  initial = "",
  message,
  confirmLabel = "확인",
  onSubmit,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initial);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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
          <button onClick={() => onSubmit(value)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
