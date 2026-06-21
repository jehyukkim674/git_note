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

export interface Segment {
  text: string;
  hit: boolean;
}

/// text를 query(대소문자 무시) 매칭 구간 기준으로 분할한다(하이라이트용).
export function splitHighlight(text: string, query: string): Segment[] {
  const q = query.trim();
  if (!q) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const segs: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(ql, i);
    if (idx === -1) {
      segs.push({ text: text.slice(i), hit: false });
      break;
    }
    if (idx > i) segs.push({ text: text.slice(i, idx), hit: false });
    segs.push({ text: text.slice(idx, idx + q.length), hit: true });
    i = idx + q.length;
  }
  return segs;
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

/// 본문에서 index번째 태스크 항목(- [ ] / - [x])의 체크 상태를 토글한다.
/// 렌더된 미리보기의 체크박스 순서(문서 순서)와 일치한다.
export function toggleTaskAt(content: string, index: number): string {
  let n = -1;
  return content
    .split("\n")
    .map((line) => {
      const m = line.match(/^(\s*[-*+]\s+\[)([ xX])(\].*)$/);
      if (!m) return line;
      n += 1;
      if (n !== index) return line;
      const checked = m[2].toLowerCase() === "x";
      return `${m[1]}${checked ? " " : "x"}${m[3]}`;
    })
    .join("\n");
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

/// Date를 YYYY-MM-DD 문자열로 변환한다(로컬 기준).
export function formatDateYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

/// 헤딩 목록으로 마크다운 목차(중첩 링크 리스트)를 생성한다.
export function generateToc(content: string): string {
  const hs = extractHeadings(content);
  if (hs.length === 0) return "";
  const min = Math.min(...hs.map((h) => h.level));
  return (
    hs
      .map((h) => `${"  ".repeat(h.level - min)}- [${h.text}](#${h.slug})`)
      .join("\n") + "\n"
  );
}
