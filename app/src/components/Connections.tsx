import { useMemo } from "react";
import { extractTags } from "../lib/text";

interface Props {
  content: string;
  backlinks: string[];
  onTag: (tag: string) => void;
  onOpen: (path: string) => void;
}

export function Connections({ content, backlinks, onTag, onOpen }: Props) {
  const tags = useMemo(() => extractTags(content), [content]);

  if (tags.length === 0 && backlinks.length === 0) return null;

  return (
    <div className="connections">
      {tags.length > 0 && (
        <div className="conn-row">
          <span className="conn-label">태그</span>
          <span className="conn-tags">
            {tags.map((t) => (
              <button key={t} className="tag-chip" onClick={() => onTag(t)}>
                #{t}
              </button>
            ))}
          </span>
        </div>
      )}
      {backlinks.length > 0 && (
        <div className="conn-row">
          <span className="conn-label">백링크</span>
          <span className="conn-links">
            {backlinks.map((p) => (
              <button key={p} className="backlink" onClick={() => onOpen(p)}>
                {p.split("/").pop()?.replace(/\.md$/, "")}
              </button>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
