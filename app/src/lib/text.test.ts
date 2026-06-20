import { describe, it, expect } from "vitest";
import {
  stripFrontmatter,
  ownerRepoFromUrl,
  slugify,
  extractHeadings,
  hasConflictMarkers,
  extractTags,
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
