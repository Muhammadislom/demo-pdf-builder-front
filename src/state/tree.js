// tree.js — pure helpers for the block-tree. A "path" is an array of child
// indices from the root: [] = root, [2] = root.children[2], [2,1] = nested.

export function emptyRoot() {
  return { type: 'page', children: [] }
}

export function clone(node) {
  return JSON.parse(JSON.stringify(node))
}

export function getNode(root, path) {
  let n = root
  for (const i of path) {
    if (!n?.children || n.children[i] == null) return null
    n = n.children[i]
  }
  return n
}

// withNode returns a new root with the node at `path` replaced by updater(node).
export function withNode(root, path, updater) {
  if (path.length === 0) return updater(root)
  const [head, ...rest] = path
  const children = (root.children || []).slice()
  children[head] = withNode(children[head], rest, updater)
  return { ...root, children }
}

export function insertChild(root, parentPath, index, node) {
  return withNode(root, parentPath, (p) => {
    const children = (p.children || []).slice()
    const at = index == null ? children.length : index
    children.splice(at, 0, node)
    return { ...p, children }
  })
}

export function removeNode(root, path) {
  if (path.length === 0) return root
  const parentPath = path.slice(0, -1)
  const idx = path[path.length - 1]
  return withNode(root, parentPath, (p) => {
    const children = (p.children || []).slice()
    children.splice(idx, 1)
    return { ...p, children }
  })
}

// reorderChildren moves child `from` -> `to` within the container at parentPath.
export function reorderChildren(root, parentPath, from, to) {
  return withNode(root, parentPath, (p) => {
    const children = (p.children || []).slice()
    if (from < 0 || from >= children.length || to < 0 || to >= children.length) return p
    const [moved] = children.splice(from, 1)
    children.splice(to, 0, moved)
    return { ...p, children }
  })
}

// replaceWithMany swaps the node at `path` for an array of nodes (in place at
// the same index). Used to "explode" a coarse system block into editable ones.
export function replaceWithMany(root, path, nodes) {
  if (path.length === 0) return root // can't replace the page root
  const parentPath = path.slice(0, -1)
  const idx = path[path.length - 1]
  return withNode(root, parentPath, (p) => {
    const children = (p.children || []).slice()
    children.splice(idx, 1, ...nodes)
    return { ...p, children }
  })
}

export function samePath(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i])
}

// remapSelection keeps a selection path pointing at the SAME node after a
// reorder within `parentPath`. Paths are positional, so without this a reorder
// would silently re-target the inspector at whatever slid into the old index.
export function remapSelection(selected, parentPath, from, to) {
  if (!selected || selected.length <= parentPath.length) return selected
  for (let i = 0; i < parentPath.length; i++) {
    if (selected[i] !== parentPath[i]) return selected // different subtree
  }
  const depth = parentPath.length
  const idx = selected[depth]
  let next = idx
  if (idx === from) next = to
  else if (from < to && idx > from && idx <= to) next = idx - 1
  else if (to < from && idx >= to && idx < from) next = idx + 1
  if (next === idx) return selected
  const out = selected.slice()
  out[depth] = next
  return out
}

// collectComputed returns all computed_value nodes in tree order (for scalar resolution).
export function collectComputed(root, out = []) {
  if (!root) return out
  if (root.type === 'computed_value' && root.computed) out.push(root)
  for (const c of root.children || []) collectComputed(c, out)
  return out
}
