import { useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { renderMarkdown } from "../lib/markdown";

interface Props {
  content: string;
  vaultPath: string | null;
  onWikiLink?: (name: string) => void;
  onToggleTask?: (index: number) => void;
}

export function Preview({ content, vaultPath, onWikiLink, onToggleTask }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);
  const html = useMemo(
    () => renderMarkdown(content, vaultPath),
    [content, vaultPath]
  );

  // 27. 코드 블록 복사 버튼 + 8. 체크박스 토글
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    root.querySelectorAll("pre").forEach((pre) => {
      if (pre.querySelector(".code-copy")) return;
      const btn = document.createElement("button");
      btn.className = "code-copy";
      btn.type = "button";
      btn.textContent = "복사";
      btn.addEventListener("click", () => {
        const code = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
        void navigator.clipboard.writeText(code).then(() => {
          btn.textContent = "복사됨!";
          setTimeout(() => (btn.textContent = "복사"), 1200);
        });
      });
      pre.appendChild(btn);
    });

    // 8. 태스크 리스트 항목을 클릭 가능한 체크박스로 변환
    let taskIdx = 0;
    root.querySelectorAll("li").forEach((li) => {
      const re = /^(<p>)?\[([ xX])\]\s/;
      const m = li.innerHTML.match(re);
      if (!m) return;
      const idx = taskIdx++;
      const checked = m[2].toLowerCase() === "x";
      li.classList.add("task-item");
      li.innerHTML = li.innerHTML.replace(
        re,
        (_full, p) =>
          `${p ?? ""}<input type="checkbox" class="task-check" data-task="${idx}"${
            checked ? " checked" : ""
          } /> `
      );
    });
  }, [html]);

  // 8. 체크박스 변경을 원문에 반영(이벤트 위임)
  useEffect(() => {
    const root = ref.current;
    if (!root || !onToggleTask) return;
    const onChange = (e: Event) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement && t.classList.contains("task-check")) {
        const idx = Number(t.dataset.task);
        if (!Number.isNaN(idx)) onToggleTask(idx);
      }
    };
    root.addEventListener("change", onChange);
    return () => root.removeEventListener("change", onChange);
  }, [onToggleTask]);

  // 6/7. 읽기 진행률 · 맨 위로 버튼
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const max = el.scrollHeight - el.clientHeight;
    setProgress(max > 0 ? (el.scrollTop / max) * 100 : 0);
    setShowTop(el.scrollTop > 300);
  };

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;

    const wiki = anchor.getAttribute("data-wikilink");
    if (wiki !== null) {
      e.preventDefault();
      onWikiLink?.(wiki);
      return;
    }
    // 외부 링크는 webview를 이탈시키지 않고 기본 브라우저로 연다.
    const href = anchor.getAttribute("href") ?? "";
    if (/^https?:/i.test(href)) {
      e.preventDefault();
      void openUrl(href);
    }
  };

  if (!content.trim()) {
    return (
      <div className="preview-empty">
        <div className="empty-icon" aria-hidden="true">👀</div>
        <p>여기에 미리보기가 표시됩니다.</p>
      </div>
    );
  }

  return (
    <div className="preview-scroll">
      <div className="reading-bar" style={{ width: `${progress}%` }} aria-hidden="true" />
      <div
        ref={ref}
        className="preview markdown-body"
        onClick={onClick}
        onScroll={onScroll}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {showTop && (
        <button
          className="scroll-top"
          title="맨 위로"
          aria-label="맨 위로"
          onClick={() =>
            ref.current?.scrollTo({ top: 0, behavior: "smooth" })
          }
        >
          ↑
        </button>
      )}
    </div>
  );
}
