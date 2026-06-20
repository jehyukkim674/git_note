import { useMemo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { renderMarkdown } from "../lib/markdown";

interface Props {
  content: string;
  vaultPath: string | null;
  onWikiLink?: (name: string) => void;
}

export function Preview({ content, vaultPath, onWikiLink }: Props) {
  const html = useMemo(
    () => renderMarkdown(content, vaultPath),
    [content, vaultPath]
  );

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
      className="preview markdown-body"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
