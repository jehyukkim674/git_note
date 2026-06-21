import { describe, it, expect } from "vitest";
import { renderMarkdown, stripFrontmatter } from "./markdown";

describe("renderMarkdown", () => {
  it("기본 마크다운을 HTML로 변환한다", () => {
    const html = renderMarkdown("# 제목\n\n**굵게**", null);
    expect(html).toContain("<h1");
    expect(html).toContain("id=\"제목\"");
    expect(html).toContain("<strong>굵게</strong>");
  });

  it("프론트매터를 제거하고 렌더한다", () => {
    const html = renderMarkdown("---\ncreated: 2026-01-01\n---\n\n본문", null);
    expect(html).not.toContain("created");
    expect(html).toContain("본문");
  });

  it("위키링크를 data-wikilink 앵커로 변환한다", () => {
    const html = renderMarkdown("[[다른노트]]", null);
    expect(html).toContain('data-wikilink="다른노트"');
  });

  it("상대 이미지 경로를 asset URL로 변환한다(vaultPath 있을 때)", () => {
    const html = renderMarkdown("![](assets/a.png)", "/vault");
    expect(html).toContain("asset://localhost//vault/assets/a.png");
  });

  it("절대 이미지 경로는 그대로 둔다", () => {
    const html = renderMarkdown("![](https://x/y.png)", "/vault");
    expect(html).toContain("https://x/y.png");
  });

  it("위험한 스크립트는 새니타이즈한다", () => {
    const html = renderMarkdown("<script>alert(1)</script>", null);
    expect(html).not.toContain("<script>");
  });

  it("코드 펜스를 하이라이트한다", () => {
    const html = renderMarkdown("```js\nconst a = 1;\n```", null);
    expect(html).toContain("<pre");
    expect(html).toContain("<code");
  });

  it("언어 없는/모르는 펜스는 하이라이트 없이 렌더한다", () => {
    expect(renderMarkdown("```\nplain\n```", null)).toContain("<pre");
    expect(renderMarkdown("```없는언어\nx\n```", null)).toContain("<pre");
  });

  it("stripFrontmatter는 재노출되어 동작한다", () => {
    expect(stripFrontmatter("---\na: 1\n---\n본문")).toBe("본문");
  });
});
