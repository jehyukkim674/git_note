/// 선행 YAML 프론트매터(--- … ---)를 제거한다.
export function stripFrontmatter(content: string): string {
  const m = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? content.slice(m[0].length) : content;
}

/// GitHub 저장소 URL에서 "owner/repo"를 추출(없으면 null).
export function ownerRepoFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

/// 헤딩 텍스트를 앵커 슬러그로 변환한다.
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-");
}

export interface Heading {
  level: number;
  text: string;
  slug: string;
}

/// 마크다운 본문에서 헤딩 목록을 추출한다(코드펜스 내부 제외).
export function extractHeadings(content: string): Heading[] {
  const body = stripFrontmatter(content);
  const headings: Heading[] = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      const text = m[2].trim();
      headings.push({ level: m[1].length, text, slug: slugify(text) });
    }
  }
  return headings;
}
