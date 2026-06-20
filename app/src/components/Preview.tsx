import { useMemo } from "react";
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
    const target = (e.target as HTMLElement).closest("a[data-wikilink]");
    if (target && onWikiLink) {
      e.preventDefault();
      onWikiLink(target.getAttribute("data-wikilink") ?? "");
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
