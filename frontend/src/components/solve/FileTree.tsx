"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[] | null; // null = file
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const path of paths) {
    let level = root;
    path.split("/").forEach((name, i, parts) => {
      const isFile = i === parts.length - 1;
      let node = level.find((n) => n.name === name && (n.children === null) === isFile);
      if (!node) {
        node = { name, path: parts.slice(0, i + 1).join("/"), children: isFile ? null : [] };
        level.push(node);
      }
      if (node.children) level = node.children;
    });
  }
  const sort = (nodes: TreeNode[]): TreeNode[] =>
    nodes
      .sort((a, b) => Number(a.children === null) - Number(b.children === null) || a.name.localeCompare(b.name))
      .map((n) => (n.children ? { ...n, children: sort(n.children) } : n));
  return sort(root);
}

export function FileTree({
  rootName,
  paths,
  activePath,
  onOpen,
}: {
  rootName: string;
  paths: string[];
  activePath: string;
  onOpen: (path: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  }

  function render(nodes: TreeNode[], depth: number) {
    return nodes.map((n) => {
      const indent = { paddingLeft: 20 + depth * 12 };
      if (!n.children) {
        return (
          <li key={n.path}>
            <button
              type="button"
              onClick={() => onOpen(n.path)}
              aria-current={n.path === activePath ? "true" : undefined}
              style={indent}
              className={`block w-full truncate py-1.5 pr-3 text-left text-[13px] ${
                n.path === activePath ? "bg-border/60 text-text" : "text-muted hover:bg-border/30 hover:text-text"
              }`}
            >
              {n.name}
            </button>
          </li>
        );
      }
      const open = !collapsed.has(n.path);
      return (
        <li key={n.path}>
          <button
            type="button"
            onClick={() => toggle(n.path)}
            aria-expanded={open}
            style={indent}
            className="flex w-full items-center gap-1 py-1.5 pr-3 text-left text-[13px] text-muted hover:text-text"
          >
            <Icon name={open ? "chevronDown" : "chevronRight"} className="h-3 w-3 shrink-0" />
            {n.name}
          </button>
          {open ? <ul>{render(n.children, depth + 1)}</ul> : null}
        </li>
      );
    });
  }

  return (
    <nav aria-label="Files" className="py-4">
      <p className="px-5 text-[11px] font-semibold uppercase tracking-wide text-muted">Explorer</p>
      <p className="mt-4 flex items-center gap-1 px-4 text-xs font-semibold uppercase text-text">
        <Icon name="chevronDown" className="h-3 w-3" /> {rootName}
      </p>
      <ul className="mt-2">{render(buildTree(paths), 0)}</ul>
    </nav>
  );
}
