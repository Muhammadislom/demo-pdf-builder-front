import React, { useMemo } from 'react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '../state/store.js'
import { buildRenderModel } from '../engine/renderModel.js'
import { samePath } from '../state/tree.js'
import NodePreview from './NodePreview.jsx'

// Canvas: the live PDF approximation. Top-level blocks are sortable (drag the
// grip to reorder) and clickable to select. The render model is computed once
// per render so claiming is deterministic.
export default function Canvas() {
  const { state, dispatch } = useStore()
  const { tree, mock, doc, selected } = state
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const model = useMemo(() => buildRenderModel(tree, mock, doc), [tree, mock, doc])
  const children = tree.children || []
  const ids = children.map((_, i) => `c${i}`)

  const onDragEnd = (e) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = ids.indexOf(active.id)
    const to = ids.indexOf(over.id)
    if (from >= 0 && to >= 0) dispatch({ type: 'REORDER', parentPath: [], from, to })
  }

  if (!mock) {
    return (
      <section className="canvas empty">
        <div className="empty-hint">
          <h3>No data loaded</h3>
          <p>Enter the GraphQL endpoint + JWT above and press <b>Load</b>.</p>
          <p className="muted small">The builder pulls the resolved layout and synthetic preview data
            (<code>pdfLayoutMockData</code>) for the selected document.</p>
        </div>
      </section>
    )
  }

  const mixWarn = model.hasRowPool && model.hasCoarseClaimer
  return (
    <section className="canvas">
      {(mixWarn || model.orphans.length > 0) && (
        <div className="canvas-warnings">
          {mixWarn && (
            <div className="warn">⚠ This layout mixes a <b>system block</b> that claims rows (e.g. body / charges) with
              custom <b>list/table</b> blocks — rows may be double-counted. Prefer all-custom or all-system.</div>
          )}
          {model.orphans.length > 0 && (
            <div className="warn info">ℹ {model.orphans.length} row(s) match no block and won't render:
              {' '}{model.orphans.slice(0, 6).map((r) => r.label || r.typeCode).join(', ')}
              {model.orphans.length > 6 ? '…' : ''}. Add a catch-all block if you want them shown.</div>
          )}
        </div>
      )}

      <div className="page" onClick={() => dispatch({ type: 'SELECT', path: null })}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {children.length === 0 && <div className="page-empty muted">Empty page — add blocks from the left palette.</div>}
            {children.map((node, i) => (
              <SortableBlock key={ids[i]} id={ids[i]}>
                <NodePreview
                  node={node}
                  path={[i]}
                  model={model}
                  doc={doc}
                  mock={mock}
                  selected={selected}
                  onSelect={(p, e) => { e.stopPropagation(); dispatch({ type: 'SELECT', path: p }) }}
                  isSelected={samePath(selected, [i])}
                />
              </SortableBlock>
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </section>
  )
}

function SortableBlock({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
  return (
    <div ref={setNodeRef} style={style} className="block-wrap">
      <span className="grip" {...attributes} {...listeners} title="Drag to reorder">⠿</span>
      <div className="block-body">{children}</div>
    </div>
  )
}
