import { useEffect, useMemo } from "react";
import { stripFrontmatter } from "../lib/markdown";
import { extractHeadings, extractTags } from "../lib/text";

/// 27. 현재 노트 통계(단어·글자·줄·헤딩·태그·예상 읽기시간).
export function StatsModal({
  content,
  path,
  onClose,
}: {
  content: string;
  path: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const s = useMemo(() => {
    const body = stripFrontmatter(content);
    const trimmed = body.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const chars = body.length;
    const charsNoSpace = body.replace(/\s/g, "").length;
    const lines = body ? body.split("\n").length : 0;
    const headings = extractHeadings(content).length;
    const tags = extractTags(content).length;
    const mins = Math.max(1, Math.ceil(words / 200));
    return { words, chars, charsNoSpace, lines, headings, tags, mins };
  }, [content]);

  const rows: [string, string | number][] = [
    ["단어", s.words],
    ["글자 (공백 포함)", s.chars],
    ["글자 (공백 제외)", s.charsNoSpace],
    ["줄", s.lines],
    ["헤딩", s.headings],
    ["태그", s.tags],
    ["예상 읽기시간", `${s.mins}분`],
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="통계"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>통계</h2>
        {path && <p className="dim path-text">{path}</p>}
        <table className="stats-table">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td className="stats-val">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row-end">
          <button onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
