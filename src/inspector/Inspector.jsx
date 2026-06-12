import React from 'react'
import { useStore } from '../state/store.js'
import { getNode } from '../state/tree.js'
import { meta, explodeNode, cloneWithNewIds } from '../engine/catalog.js'
import NodeJsonEditor from './NodeJsonEditor.jsx'
import PropsEditor from './PropsEditor.jsx'
import RuleBuilder from './RuleBuilder.jsx'
import AggregateEditor from './AggregateEditor.jsx'
import FormulaBuilder from './FormulaBuilder.jsx'
import ColumnsEditor from './ColumnsEditor.jsx'
import WidthControl from './WidthControl.jsx'
import MetricCardEditor from './MetricCardEditor.jsx'
import ChildrenEditor from './ChildrenEditor.jsx'
import BindingEditor from './BindingEditor.jsx'
import LabelOverrideEditor from './LabelOverrideEditor.jsx'
import FieldEditor from './FieldEditor.jsx'
import StyleEditor from './StyleEditor.jsx'

// Inspector: edits the selected node. Every control is derived from the catalog
// `accepts` flags, so the panel always matches what the engine supports.
export default function Inspector() {
  const { state, dispatch } = useStore()
  const { tree, selected } = state

  if (!selected) {
    return (
      <aside className="inspector">
        <div className="muted insp-empty">Select a block in the canvas to edit it.</div>
      </aside>
    )
  }
  const node = getNode(tree, selected)
  if (!node) {
    return <aside className="inspector"><div className="muted insp-empty">—</div></aside>
  }
  const m = meta(node.type, state.doc)
  const setNode = (next) => dispatch({ type: 'REPLACE_NODE', path: selected, node: next })

  return (
    <aside className="inspector">
      <div className="insp-head">
        <div>
          <div className="insp-type">{m.label}</div>
          <div className="muted small mono">{node.type}{node.id ? ` · ${node.id}` : ''}</div>
        </div>
        <div className="insp-actions">
          <button
            title="Duplicate this block (new ids)"
            onClick={() => {
              const copy = cloneWithNewIds(node)
              dispatch({ type: 'INSERT', parentPath: selected.slice(0, -1), index: selected[selected.length - 1] + 1, node: copy })
            }}
          >⧉ Duplicate</button>
          <button className="danger" onClick={() => dispatch({ type: 'REMOVE', path: selected })}>Delete</button>
        </div>
      </div>

      {m.system && (
        <div className="insp-section">
          <div className="insp-card muted">
            System block — rendered by the engine as in the built-in layout. To edit its content,
            turn it into composable blocks:
          </div>
          {m.explodable
            ? (
              <button
                className="explode-btn"
                onClick={() => {
                  const nodes = explodeNode(node, state.doc)
                  if (nodes) dispatch({ type: 'EXPAND', path: selected, nodes })
                }}
              >↘ Replace with editable blocks</button>
            )
            : <div className="muted small">Fixed chrome (page footer) — not editable.</div>}
        </div>
      )}

      {m.accepts?.props && m.props && (
        <Section title="Properties">
          <PropsEditor node={node} schema={m.props} onChange={setNode} />
        </Section>
      )}

      {m.accepts?.metric && (
        <Section title="Value source">
          <MetricCardEditor node={node} onChange={setNode} />
        </Section>
      )}

      {m.accepts?.boundText && (
        <Section title="Bound text">
          <FieldEditor node={node} onChange={setNode} />
        </Section>
      )}

      {m.accepts?.computed && (
        <Section title="Formula">
          <FormulaBuilder node={node} onChange={setNode} />
        </Section>
      )}

      {m.accepts?.aggregate && (
        <Section title="Aggregate">
          <AggregateEditor node={node} onChange={setNode} />
        </Section>
      )}

      {m.accepts?.binding && (
        <Section title="Data source">
          <BindingEditor node={node} onChange={setNode} />
        </Section>
      )}

      {m.accepts?.columns && node.binding?.source !== 'trips' && (
        <Section title="Columns">
          <ColumnsEditor node={node} onChange={setNode} />
        </Section>
      )}

      {m.accepts?.rule && node.binding?.source !== 'trips' && (
        <Section title="Content rule — which rows land here">
          <RuleBuilder node={node} path={selected} onChange={setNode} />
        </Section>
      )}

      {m.accepts?.labelOverride && (
        <Section title="Label overrides (per type)">
          <LabelOverrideEditor node={node} onChange={setNode} />
        </Section>
      )}

      {m.accepts?.children && (
        <Section title="Children">
          <ChildrenEditor node={node} path={selected} onChange={setNode} />
        </Section>
      )}

      {m.accepts?.width && (
        <Section title="Width (inside a row)">
          <WidthControl node={node} onChange={setNode} />
        </Section>
      )}

      {(m.accepts?.style && m.styleSchema?.length > 0) && (
        <Section title="Style (colors / size — optional, defaults = system look)">
          <StyleEditor node={node} schema={m.styleSchema} onChange={setNode} />
        </Section>
      )}

      {!m.system && (
        <Section title="Power users">
          <NodeJsonEditor node={node} onChange={setNode} />
        </Section>
      )}
    </aside>
  )
}

function Section({ title, children }) {
  return (
    <div className="insp-section">
      <div className="insp-section-title">{title}</div>
      <div className="insp-section-body">{children}</div>
    </div>
  )
}
