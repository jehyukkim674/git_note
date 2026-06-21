import { useEffect, useRef } from "react";
import type { TreeNode } from "../lib/api";

interface Props {
  nodes: TreeNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onRename?: (path: string) => void;
  onDuplicate?: (path: string) => void;
  onDelete?: (path: string) => void;
  onPin?: (path: string) => void;
  onNewInFolder?: (dir: string) => void;
  pinned?: string[];
  openDirs?: Record<string, boolean>;
  onToggleDir?: (path: string) => void;
  depth?: number;
}

function countFiles(nodes: TreeNode[]): number {
  return nodes.reduce(
    (sum, n) => sum + (n.is_dir ? countFiles(n.children) : 1),
    0
  );
}

/// 수정 시각을 상대 시간 문자열로(툴팁용).
function relativeTime(ts: number): string {
  if (!ts) return "";
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전 수정";
  if (min < 60) return `${min}분 전 수정`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전 수정`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전 수정`;
  return new Date(ms).toLocaleDateString() + " 수정";
}

function DirNode({
  node,
  depth,
  nodes: _ignored,
  ...rest
}: { node: TreeNode } & Props) {
  const open = rest.openDirs?.[node.path] ?? true;
  const count = countFiles(node.children);
  return (
    <li>
      <div className="tree-file-row">
        <button
          className="tree-row tree-dir"
          style={{ paddingLeft: depth! * 12 + 8 }}
          onClick={() => rest.onToggleDir?.(node.path)}
          title={`${node.name} (${count})`}
        >
          <span
            className="tree-caret"
            style={{ transform: open ? "rotate(90deg)" : "none" }}
          >
            ▸
          </span>
          {node.name}
          <span className="dir-count">{count}</span>
        </button>
        {rest.onNewInFolder && (
          <span className="tree-actions">
            <button
              className="tree-action"
              title="이 폴더에 새 노트"
              aria-label="이 폴더에 새 노트"
              onClick={() => rest.onNewInFolder!(node.path)}
            >
              ＋
            </button>
          </span>
        )}
      </div>
      {open && <TreeView nodes={node.children} depth={depth! + 1} {...rest} />}
    </li>
  );
}

export function TreeView({
  nodes,
  selectedPath,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
  onPin,
  onNewInFolder,
  pinned,
  openDirs,
  onToggleDir,
  depth = 0,
}: Props) {
  return (
    <ul className="tree-list">
      {nodes.map((node) =>
        node.is_dir ? (
          <DirNode
            key={node.path}
            node={node}
            nodes={[]}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onRename={onRename}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onPin={onPin}
            onNewInFolder={onNewInFolder}
            pinned={pinned}
            openDirs={openDirs}
            onToggleDir={onToggleDir}
            depth={depth}
          />
        ) : (
          <FileNode
            key={node.path}
            node={node}
            depth={depth}
            selected={node.path === selectedPath}
            onSelect={onSelect}
            onRename={onRename}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onPin={onPin}
            pinned={pinned}
          />
        )
      )}
    </ul>
  );
}

function FileNode({
  node,
  depth,
  selected,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
  onPin,
  pinned,
}: {
  node: TreeNode;
  depth: number;
  selected: boolean;
  onSelect: (path: string) => void;
  onRename?: (path: string) => void;
  onDuplicate?: (path: string) => void;
  onDelete?: (path: string) => void;
  onPin?: (path: string) => void;
  pinned?: string[];
}) {
  const ref = useRef<HTMLButtonElement>(null);

  // 20. 선택된 노트를 화면에 보이도록 스크롤
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const name = node.name.replace(/\.md$/, "");
  return (
    <li className="tree-file-row">
      <button
        ref={ref}
        className={"tree-row tree-file" + (selected ? " selected" : "")}
        style={{ paddingLeft: depth * 12 + 22 }}
        onClick={() => onSelect(node.path)}
        title={`${name}${node.modified ? " · " + relativeTime(node.modified) : ""}`}
      >
        {name}
      </button>
      <span className="tree-actions">
        {onPin && (
          <button
            className="tree-action"
            title="고정"
            onClick={() => onPin(node.path)}
          >
            {pinned?.includes(node.path) ? "★" : "☆"}
          </button>
        )}
        {onRename && (
          <button
            className="tree-action"
            title="이름변경"
            onClick={() => onRename(node.path)}
          >
            ✎
          </button>
        )}
        {onDuplicate && (
          <button
            className="tree-action"
            title="복제"
            onClick={() => onDuplicate(node.path)}
          >
            ⧉
          </button>
        )}
        {onDelete && (
          <button
            className="tree-action"
            title="삭제"
            onClick={() => onDelete(node.path)}
          >
            🗑
          </button>
        )}
      </span>
    </li>
  );
}
