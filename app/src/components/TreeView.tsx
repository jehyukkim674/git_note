import { useState } from "react";
import type { TreeNode } from "../lib/api";

interface Props {
  nodes: TreeNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  depth?: number;
}

function DirNode({ node, selectedPath, onSelect, depth }: { node: TreeNode } & Props) {
  const [open, setOpen] = useState(true);
  return (
    <li>
      <button
        className="tree-row tree-dir"
        style={{ paddingLeft: depth! * 12 + 8 }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="tree-caret">{open ? "▾" : "▸"}</span>
        {node.name}
      </button>
      {open && (
        <TreeView
          nodes={node.children}
          selectedPath={selectedPath}
          onSelect={onSelect}
          depth={depth! + 1}
        />
      )}
    </li>
  );
}

export function TreeView({ nodes, selectedPath, onSelect, depth = 0 }: Props) {
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
            depth={depth}
          />
        ) : (
          <li key={node.path}>
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
          </li>
        )
      )}
    </ul>
  );
}
