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

/// 본문에서 #태그를 추출한다(헤딩 `# ` 제외, 중복 제거, 순서 유지).
export function extractTags(content: string): string[] {
  const body = stripFrontmatter(content);
  const re = /(?:^|\s)#([\p{L}\d][\p{L}\d_-]*)/gu;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of body.matchAll(re)) {
    const tag = m[1];
    if (/^\d+$/.test(tag)) continue; // 순수 숫자(#1 등 이슈번호) 오탐 제외
    if (!seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

/// git 병합 충돌 마커(<<<<<<< / ======= / >>>>>>>)가 본문에 남아있는지 검사한다.
export function hasConflictMarkers(content: string): boolean {
  return /^(<{7}|={7}|>{7})/m.test(content);
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
