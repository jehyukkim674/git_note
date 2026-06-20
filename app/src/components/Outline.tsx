import { useMemo } from "react";
import { extractHeadings } from "../lib/text";

export function Outline({ content }: { content: string }) {
  const headings = useMemo(() => extractHeadings(content), [content]);

  if (headings.length === 0) {
    return <div className="outline-empty">헤딩이 없습니다.</div>;
  }

  const go = (slug: string) => {
    // id 셀렉터 문맥에서 CSS.escape 사용(속성값 문맥 아님).
    const el = document
      .querySelector(".preview")
      ?.querySelector(`#${CSS.escape(slug)}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="outline">
      {headings.map((h, i) => (
        <button
          key={`${h.slug}:${i}`}
          className="outline-item"
          style={{ paddingLeft: (h.level - 1) * 12 + 10 }}
          onClick={() => go(h.slug)}
        >
          {h.text}
        </button>
      ))}
    </div>
  );
}
