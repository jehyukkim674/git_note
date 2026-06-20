import { useState } from "react";
import type { TreeNode } from "../lib/api";

interface Props {
  nodes: TreeNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onRename?: (path: string) => void;
  onDelete?: (path: string) => void;
  onPin?: (path: string) => void;
  onNewInFolder?: (dir: string) => void;
  pinned?: string[];
  depth?: number;
}

function DirNode({
  node,
  depth,
  nodes: _ignored,
  ...rest
}: { node: TreeNode } & Props) {
  const [open, setOpen] = useState(true);
  return (
    <li>
      <div className="tree-file-row">
        <button
          className="tree-row tree-dir"
          style={{ paddingLeft: depth! * 12 + 8 }}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="tree-caret">{open ? "▾" : "▸"}</span>
          {node.name}
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
  onDelete,
  onPin,
  onNewInFolder,
  pinned,
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
            onDelete={onDelete}
            onPin={onPin}
            onNewInFolder={onNewInFolder}
            pinned={pinned}
            depth={depth}
          />
        ) : (
          <li key={node.path} className="tree-file-row">
            <button
              className={
                "tree-row tree-file" +
                (node.path === selectedPath ? " selected" : "")
              }
              style={{ paddingLeft: depth * 12 + 22 }}
              onClick={() => onSelect(node.path)}
            >
              {node.name.replace(/\.md$/, "")}
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
        )
      )}
    </ul>
  );
}
