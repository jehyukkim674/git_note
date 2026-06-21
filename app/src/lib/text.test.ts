import { describe, it, expect } from "vitest";
import {
  stripFrontmatter,
  ownerRepoFromUrl,
  slugify,
  extractHeadings,
  hasConflictMarkers,
  extractTags,
  splitHighlight,
  toggleTaskAt,
  formatDateYmd,
  generateToc,
} from "./text";

describe("stripFrontmatter", () => {
  it("선행 프론트매터를 제거한다", () => {
    const input = "---\ntitle: x\ntags: [a]\n---\n# 본문\n내용";
    expect(stripFrontmatter(input)).toBe("# 본문\n내용");
  });
  it("프론트매터가 없으면 그대로 둔다", () => {
    expect(stripFrontmatter("# 본문")).toBe("# 본문");
  });
  it("본문 중간의 --- 는 건드리지 않는다", () => {
    const input = "본문\n\n---\n구분선 뒤";
    expect(stripFrontmatter(input)).toBe(input);
  });
});

describe("ownerRepoFromUrl", () => {
  it("https .git URL을 파싱한다", () => {
    expect(ownerRepoFromUrl("https://github.com/octocat/Hello-World.git")).toBe(
      "octocat/Hello-World"
    );
  });
  it(".git 없는 URL도 파싱한다", () => {
    expect(ownerRepoFromUrl("https://github.com/a/b")).toBe("a/b");
  });
  it("GitHub가 아니면 null", () => {
    expect(ownerRepoFromUrl("https://example.com/a/b")).toBeNull();
    expect(ownerRepoFromUrl(null)).toBeNull();
  });
});

describe("slugify", () => {
  it("공백을 하이픈으로, 특수문자 제거", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });
  it("한글을 보존한다", () => {
    expect(slugify("회의 노트")).toBe("회의-노트");
  });
});

describe("extractTags", () => {
  it("#태그를 추출하고 헤딩은 제외한다", () => {
    const md = "# 제목\n본문 #work 그리고 #idea-2 또 #work 중복";
    expect(extractTags(md)).toEqual(["work", "idea-2"]);
  });
  it("태그가 없으면 빈 배열", () => {
    expect(extractTags("# 제목\n그냥 본문")).toEqual([]);
  });
  it("순수 숫자(#1 등)는 태그로 보지 않는다", () => {
    expect(extractTags("이슈 #1 와 #2026 그리고 #v2")).toEqual(["v2"]);
  });
});

describe("splitHighlight", () => {
  it("매칭 구간을 hit로 분할한다", () => {
    expect(splitHighlight("Hello World", "world")).toEqual([
      { text: "Hello ", hit: false },
      { text: "World", hit: true },
    ]);
  });
  it("빈 쿼리는 전체를 non-hit", () => {
    expect(splitHighlight("abc", "")).toEqual([{ text: "abc", hit: false }]);
  });
  it("여러 매칭을 모두 분할한다", () => {
    expect(splitHighlight("a x a", "a")).toEqual([
      { text: "a", hit: true },
      { text: " x ", hit: false },
      { text: "a", hit: true },
    ]);
  });
  it("매칭이 없으면 전체를 non-hit로 반환한다", () => {
    expect(splitHighlight("abcdef", "zzz")).toEqual([
      { text: "abcdef", hit: false },
    ]);
  });
});

describe("hasConflictMarkers", () => {
  it("충돌 마커를 감지한다", () => {
    const c = "a\n<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> branch\nb";
    expect(hasConflictMarkers(c)).toBe(true);
  });
  it("일반 본문은 false", () => {
    expect(hasConflictMarkers("# 제목\n내용 ======= 아님")).toBe(false);
  });
});

describe("extractHeadings", () => {
  it("레벨과 슬러그를 추출한다", () => {
    const md = "# 제목\n내용\n## 소제목\n```\n# 코드 안 헤딩\n```\n### 깊은";
    const hs = extractHeadings(md);
    expect(hs).toEqual([
      { level: 1, text: "제목", slug: "제목" },
      { level: 2, text: "소제목", slug: "소제목" },
      { level: 3, text: "깊은", slug: "깊은" },
    ]);
  });
});

describe("toggleTaskAt", () => {
  const doc = "# 제목\n\n- [ ] 첫째\n- [x] 둘째\n- 일반 항목\n- [ ] 셋째";

  it("index 0의 미완료를 완료로 바꾼다", () => {
    expect(toggleTaskAt(doc, 0)).toContain("- [x] 첫째");
  });

  it("index 1의 완료를 미완료로 바꾼다", () => {
    expect(toggleTaskAt(doc, 1)).toContain("- [ ] 둘째");
  });

  it("태스크가 아닌 줄은 인덱스에서 제외된다(셋째=index 2)", () => {
    const out = toggleTaskAt(doc, 2);
    expect(out).toContain("- [x] 셋째");
    expect(out).toContain("- 일반 항목");
  });

  it("범위를 벗어난 인덱스는 원문을 유지한다", () => {
    expect(toggleTaskAt(doc, 9)).toBe(doc);
  });
});

describe("formatDateYmd", () => {
  it("YYYY-MM-DD로 0 채움 포맷한다", () => {
    expect(formatDateYmd(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(formatDateYmd(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("generateToc", () => {
  it("헤딩을 중첩 링크 목록으로 만든다", () => {
    const md = "# 제목\n## 소제목\n### 깊은";
    expect(generateToc(md)).toBe(
      "- [제목](#제목)\n  - [소제목](#소제목)\n    - [깊은](#깊은)\n"
    );
  });
  it("헤딩이 없으면 빈 문자열", () => {
    expect(generateToc("본문만 있음")).toBe("");
  });
});
