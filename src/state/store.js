import React, { createContext, useContext, useReducer, useMemo } from 'react'
import * as T from './tree.js'

// Global builder state. The tree edits push onto a history stack for undo/redo;
// connection/selection/meta live alongside but don't participate in history.

const LS = {
  endpoint: 'pdfb_endpoint',
  jwt: 'pdfb_token',
}

const initial = {
  endpoint: localStorage.getItem(LS.endpoint) || 'http://localhost:8080/query',
  jwt: localStorage.getItem(LS.jwt) || '',
  doc: 'statement', // statement | invoice
  variant: '', // '' => default
  mock: null,
  isCustom: false,
  source: '',
  theme: null, // round-tripped untouched so saving never NULLs stored theme/page
  page: null,
  savedVariants: [], // company's actually-saved variants (from listLayouts)
  status: { msg: 'Set endpoint + JWT, then Load.', kind: 'info' },
  // history
  tree: T.emptyRoot(),
  past: [],
  future: [],
  selected: null, // path array | null
}

function pushHistory(state, nextTree, selected = state.selected) {
  return {
    ...state,
    past: [...state.past, state.tree].slice(-100),
    future: [],
    tree: nextTree,
    selected,
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CONN':
      if (action.endpoint != null) localStorage.setItem(LS.endpoint, action.endpoint)
      if (action.jwt != null) localStorage.setItem(LS.jwt, action.jwt)
      return { ...state, endpoint: action.endpoint ?? state.endpoint, jwt: action.jwt ?? state.jwt }
    case 'SET_DOC':
      return { ...state, doc: action.doc, variant: '', selected: null }
    case 'SET_VARIANT':
      return { ...state, variant: action.variant }
    case 'STATUS':
      return { ...state, status: { msg: action.msg, kind: action.kind || 'info' } }
    case 'LOADED':
      return {
        ...state,
        tree: action.tree,
        mock: action.mock,
        isCustom: action.isCustom,
        source: action.source,
        theme: action.theme ?? null,
        page: action.page ?? null,
        past: [],
        future: [],
        selected: null,
        status: { msg: action.msg, kind: 'ok' },
      }
    case 'SET_VARIANTS':
      return { ...state, savedVariants: action.variants || [] }
    case 'SELECT':
      return { ...state, selected: action.path }
    case 'REPLACE_NODE':
      return pushHistory(state, T.withNode(state.tree, action.path, () => action.node))
    case 'PATCH_NODE':
      return pushHistory(state, T.withNode(state.tree, action.path, (n) => ({ ...n, ...action.patch })))
    case 'INSERT':
      return pushHistory(
        state,
        T.insertChild(state.tree, action.parentPath, action.index, action.node),
        // select the freshly inserted node
        [...action.parentPath, action.index == null ? lenAt(state.tree, action.parentPath) : action.index],
      )
    case 'REMOVE':
      return pushHistory(state, T.removeNode(state.tree, action.path), null)
    case 'EXPAND': // replace one (system) node with editable fine blocks
      if (!action.nodes?.length) return state
      return pushHistory(state, T.replaceWithMany(state.tree, action.path, action.nodes), action.path)
    case 'SET_TREE': // wholesale tree replacement (e.g. Customize body / explode-all)
      return pushHistory(state, action.tree, null)
    case 'REORDER':
      return pushHistory(
        state,
        T.reorderChildren(state.tree, action.parentPath, action.from, action.to),
        T.remapSelection(state.selected, action.parentPath, action.from, action.to),
      )
    case 'UNDO': {
      if (!state.past.length) return state
      const prev = state.past[state.past.length - 1]
      return { ...state, tree: prev, past: state.past.slice(0, -1), future: [state.tree, ...state.future], selected: null }
    }
    case 'REDO': {
      if (!state.future.length) return state
      const next = state.future[0]
      return { ...state, tree: next, past: [...state.past, state.tree], future: state.future.slice(1), selected: null }
    }
    default:
      return state
  }
}

function lenAt(root, parentPath) {
  const p = T.getNode(root, parentPath)
  return (p?.children || []).length
}

const StoreCtx = createContext(null)

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const value = useMemo(() => ({ state, dispatch }), [state])
  return React.createElement(StoreCtx.Provider, { value }, children)
}

export function useStore() {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
