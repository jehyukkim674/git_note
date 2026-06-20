import { useMemo } from "react";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

interface Props {
  content: string;
}

export function Preview({ content }: Props) {
  const html = useMemo(
    () => DOMPurify.sanitize(md.render(content)),
    [content]
  );
  return (
    <div
      className="preview markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
