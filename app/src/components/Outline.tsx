import { useEffect, useMemo, useState } from "react";
import { extractHeadings } from "../lib/text";

export function Outline({ content }: { content: string }) {
  const headings = useMemo(() => extractHeadings(content), [content]);
  const [active, setActive] = useState<string>("");

  // 12. 스크롤 스파이: 화면에 보이는 헤딩을 강조
  useEffect(() => {
    const scroller = document.querySelector<HTMLElement>(".preview");
    if (!scroller) return;
    const targets = Array.from(scroller.querySelectorAll<HTMLElement>("[id]"));
    if (targets.length === 0) return;
    const visible = new Set<string>();
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id);
          else visible.delete(e.target.id);
        }
        // 문서 순서상 가장 위에 보이는 헤딩을 활성으로
        const first = targets.find((t) => visible.has(t.id));
        if (first) setActive(first.id);
      },
      { root: scroller, rootMargin: "0px 0px -70% 0px" }
    );
    targets.forEach((t) => obs.observe(t));
    return () => obs.disconnect();
  }, [content]);

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
          className={"outline-item" + (h.slug === active ? " active" : "")}
          style={{ paddingLeft: (h.level - 1) * 12 + 10 }}
          onClick={() => go(h.slug)}
        >
          {h.text}
        </button>
      ))}
    </div>
  );
}
