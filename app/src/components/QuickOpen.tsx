import { useMemo, useState } from "react";
import { useStore } from "../store";
import { flattenFiles } from "../lib/tree";

export function QuickOpen({ onClose }: { onClose: () => void }) {
  const { tree, selectNote } = useStore();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const files = useMemo(() => flattenFiles(tree), [tree]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? files.filter((p) => p.toLowerCase().includes(q))
      : files;
    return list.slice(0, 50);
  }, [files, query]);

  const choose = (path: string) => {
    selectNote(path);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="quickopen" onClick={(e) => e.stopPropagation()}>
        <input
          className="text-input"
          autoFocus
          placeholder="노트 빠른 열기…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && matches[active]) {
              choose(matches[active]);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
        />
        <ul className="quickopen-list">
          {matches.length === 0 && <li className="search-empty">결과 없음</li>}
          {matches.map((path, i) => (
            <li key={path}>
              <button
                className={"quickopen-item" + (i === active ? " active" : "")}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(path)}
              >
                <span className="qo-name">
                  {path.split("/").pop()?.replace(/\.md$/, "")}
                </span>
                <span className="qo-path">{path}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="qo-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> 이동</span>
          <span><kbd>↵</kbd> 열기</span>
          <span><kbd>esc</kbd> 닫기</span>
        </div>
      </div>
    </div>
  );
}
