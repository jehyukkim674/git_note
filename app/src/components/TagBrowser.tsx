import { useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import { api } from "../lib/api";
import { flattenFiles } from "../lib/tree";
import { extractTags } from "../lib/text";

/// 16. 보관함 전체의 태그를 집계해 보여주고, 클릭하면 해당 태그로 검색한다.
export function TagBrowser({ onClose }: { onClose: () => void }) {
  const { tree, setSearchQuery } = useStore();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const files = useMemo(() => flattenFiles(tree), [tree]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const acc: Record<string, number> = {};
      for (const path of files) {
        try {
          const content = await api.readNote(path);
          for (const tag of extractTags(content)) {
            acc[tag] = (acc[tag] ?? 0) + 1;
          }
        } catch {
          /* 무시 */
        }
      }
      if (!cancelled) {
        setCounts(acc);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [files]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sorted = Object.entries(counts).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );

  const choose = (tag: string) => {
    setSearchQuery(`#${tag}`);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="태그"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>태그</h2>
        {loading ? (
          <p className="dim">집계 중…</p>
        ) : sorted.length === 0 ? (
          <p className="dim">태그가 없습니다. 본문에 #태그를 적어보세요.</p>
        ) : (
          <div className="tag-cloud">
            {sorted.map(([tag, n]) => (
              <button key={tag} className="tag-chip" onClick={() => choose(tag)}>
                #{tag} <span className="tag-n">{n}</span>
              </button>
            ))}
          </div>
        )}
        <div className="row-end">
          <button onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
