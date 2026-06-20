import { useMemo } from "react";
import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import "highlight.js/styles/github.css";
import { convertFileSrc } from "@tauri-apps/api/core";

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  highlight: (str, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch {
        /* fall through */
      }
    }
    return "";
  },
});

// 상대경로 이미지(assets/…)를 webview가 읽을 수 있는 asset URL로 변환.
const defaultImageRender =
  md.renderer.rules.image ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const aIndex = token.attrIndex("src");
  if (aIndex >= 0 && token.attrs) {
    const src = token.attrs[aIndex][1];
    const isAbsolute = /^(https?|data|asset|tauri):/i.test(src) || src.startsWith("//");
    if (!isAbsolute && env?.vaultPath) {
      token.attrs[aIndex][1] = convertFileSrc(`${env.vaultPath}/${src}`);
    }
  }
  return defaultImageRender(tokens, idx, options, env, self);
};

// asset:// (macOS) 및 http(s) 이미지 URL 허용.
const ALLOWED_URI_REGEXP =
  /^(?:(?:https?|asset|tauri|mailto|tel|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

interface Props {
  content: string;
  vaultPath: string | null;
}

export function Preview({ content, vaultPath }: Props) {
  const html = useMemo(() => {
    const rendered = md.render(content, { vaultPath });
    return DOMPurify.sanitize(rendered, { ALLOWED_URI_REGEXP });
  }, [content, vaultPath]);

  return (
    <div
      className="preview markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
