import { describe, it, expect } from "vitest";
import { flattenFiles } from "./tree";
import type { TreeNode } from "./api";

const node = (
  name: string,
  path: string,
  is_dir: boolean,
  children: TreeNode[] = []
): TreeNode => ({ name, path, is_dir, modified: 0, children });

describe("flattenFiles", () => {
  it("중첩 트리에서 파일 경로만 평탄화한다", () => {
    const tree: TreeNode[] = [
      node("folder", "folder", true, [
        node("child.md", "folder/child.md", false),
      ]),
      node("root.md", "root.md", false),
    ];
    expect(flattenFiles(tree)).toEqual(["folder/child.md", "root.md"]);
  });

  it("빈 트리는 빈 배열", () => {
    expect(flattenFiles([])).toEqual([]);
  });
});
