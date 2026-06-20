import { useEffect, useMemo, useRef } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { renderMarkdown } from "../lib/markdown";

interface Props {
  content: string;
  vaultPath: string | null;
  onWikiLink?: (name: string) => void;
}

export function Preview({ content, vaultPath, onWikiLink }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(
    () => renderMarkdown(content, vaultPath),
    [content, vaultPath]
  );

  // 27. 코드 블록마다 복사 버튼 삽입
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
  }, [html]);

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

  return (
    <div
      ref={ref}
      className="preview markdown-body"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
