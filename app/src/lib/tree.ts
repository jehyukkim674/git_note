import type { TreeNode } from "./api";

/// 트리에서 파일 경로만 평탄화해 돌려준다(디렉토리 제외).
export function flattenFiles(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.is_dir) out.push(...flattenFiles(n.children));
    else out.push(n.path);
  }
  return out;
}
