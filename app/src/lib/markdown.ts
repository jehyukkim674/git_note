import MarkdownIt from "markdown-it";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { convertFileSrc } from "@tauri-apps/api/core";
import { slugify, stripFrontmatter } from "./text";

export { stripFrontmatter } from "./text";

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

// 상대경로 이미지(assets/…)를 webview asset URL로 변환.
const defaultImageRender =
  md.renderer.rules.image ??
  /* v8 ignore next -- markdown-it는 기본 image 렌더를 항상 제공(도달 불가) */
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

// 위키링크(wikilink:…)는 data-wikilink 속성을 가진 앵커로 렌더.
const defaultLinkRender =
  md.renderer.rules.link_open ??
  /* v8 ignore next -- 기본 link_open 렌더가 항상 존재(도달 불가) */
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const hIndex = token.attrIndex("href");
  if (hIndex >= 0 && token.attrs) {
    const href = token.attrs[hIndex][1];
    if (href.startsWith("wikilink:")) {
      const name = decodeURIComponent(href.slice("wikilink:".length));
      token.attrSet("data-wikilink", name);
      token.attrs[hIndex][1] = "#";
    }
  }
  return defaultLinkRender(tokens, idx, options, env, self);
};

// 헤딩에 슬러그 id를 부여(아웃라인 스크롤용).
const defaultHeadingRender =
  md.renderer.rules.heading_open ??
  /* v8 ignore next -- 기본 heading_open 렌더가 항상 존재(도달 불가) */
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const inline = tokens[idx + 1];
  const text = inline && inline.type === "inline" ? inline.content : "";
  tokens[idx].attrSet("id", slugify(text));
  return defaultHeadingRender(tokens, idx, options, env, self);
};

const ALLOWED_URI_REGEXP =
  /^(?:(?:https?|asset|tauri|mailto|tel|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

/// [[대상]] 위키링크를 마크다운 링크로 치환한다.
function preprocessWikiLinks(content: string): string {
  return content.replace(
    /\[\[([^\]]+)\]\]/g,
    (_match, target) => `[${target}](wikilink:${encodeURIComponent(target)})`
  );
}

/// 마크다운을 안전한 HTML로 렌더한다.
export function renderMarkdown(content: string, vaultPath: string | null): string {
  const prepared = preprocessWikiLinks(stripFrontmatter(content));
  const rendered = md.render(prepared, { vaultPath });
  return DOMPurify.sanitize(rendered, {
    ALLOWED_URI_REGEXP,
    ADD_ATTR: ["data-wikilink", "target"],
  });
}
