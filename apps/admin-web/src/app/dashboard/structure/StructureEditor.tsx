'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import s from './structure.module.css'
import {
  ApiStructure, Graph, GNode, TerminalNode, Frame, Kind, DeviceKind, Role,
  KIND_LABEL, ROLE_INFO, ROLES, NODE_W, NONE_FRAME,
  buildGraph, validate, toSavePayload, changeCount, pinsOf, pinPoint, nodeHeight, frameOfNode, tempId,
} from './model'
import { saveStructure, fetchStructureStatus, type LiveStatus } from './actions'
import { TerminalPanel, BrandPanel, DevicePanel, IssuesPanel, TablesEditor, KIND_CLASS, presenceOf } from './panels'

type Sel = { type: 'node' | 'edge' | 'frame'; key: string } | null
type Drag =
  | { mode: 'node'; key: string; ox: number; oy: number; moved: boolean }
  | { mode: 'frame'; key: string; sx: number; sy: number; fx: number; fy: number; members: { key: string; x: number; y: number }[]; moved: boolean }
  | { mode: 'resize'; key: string; sx: number; sy: number; w: number; h: number }
  | { mode: 'wire'; key: string; dir: 'in' | 'out'; kind: Kind; cur: { x: number; y: number } }
  | { mode: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }

const TEMPLATES: Record<string, { label: string; location: string; stations: { role: Role; name: string }[] }> = {
  foodtruck: { label: 'Foodtruck (1 stanowisko All-in-One)', location: 'Foodtruck', stations: [{ role: 'all_in_one', name: 'Foodtruck — lada' }] },
  counter: {
    label: 'Lada + kuchnia + wydawka', location: 'Nowy lokal',
    stations: [{ role: 'pos', name: 'Kasa' }, { role: 'kds', name: 'Kuchnia' }, { role: 'pickup', name: 'Wydawka' }],
  },
  foodcourt: {
    label: 'Food court (2 kasy, kiosk, kuchnia, wydawka)', location: 'Food court',
    stations: [
      { role: 'pos', name: 'Kasa 1' }, { role: 'pos', name: 'Kasa 2' }, { role: 'kiosk', name: 'Kiosk' },
      { role: 'kds', name: 'Kuchnia' }, { role: 'pickup', name: 'Wydawka' },
    ],
  },
}

const KIND_VAR: Record<Kind, string> = { sale: 'var(--sale)', fiscal: 'var(--fiscal)', pay: 'var(--pay)', print: 'var(--print)' }

function curve(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = Math.max(40, Math.abs(b.x - a.x) * 0.45)
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`
}

export function StructureEditor({ initial }: { initial: ApiStructure }) {
  const [original, setOriginal] = useState<ApiStructure>(initial)
  const [graph, setGraph] = useState<Graph>(() => buildGraph(initial))
  const [layoutDirty, setLayoutDirty] = useState(false)
  const [sel, setSel] = useState<Sel>(null)
  const [view, setView] = useState({ x: 20, y: 30, k: 1 })
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hotPin, setHotPin] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [addRole, setAddRole] = useState<Role>('pos')
  const [past, setPast] = useState<Graph[]>([])
  const [future, setFuture] = useState<Graph[]>([])
  const [live, setLive] = useState<LiveStatus | null>(null)
  const graphRef = useRef(graph)
  graphRef.current = graph
  const wrapRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const byKey = useMemo(() => new Map(graph.nodes.map((n) => [n.key, n])), [graph.nodes])
  const issues = useMemo(() => validate(graph), [graph])
  const payload = useMemo(() => toSavePayload(graph, original), [graph, original])
  const changes = changeCount(payload)
  const dirty = changes > 0 || layoutDirty

  const notify = useCallback((msg: string, err = false) => {
    setToast({ msg, err })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), err ? 6000 : 2600)
  }, [])

  // ---- history (undo / redo) --------------------------------------------------
  /** Call BEFORE a discrete change; drags record once, on their first movement. */
  const snapshot = useCallback(() => {
    setPast((p) => [...p.slice(-49), graphRef.current])
    setFuture([])
  }, [])
  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p
      const prev = p[p.length - 1]
      setFuture((f) => [graphRef.current, ...f].slice(0, 50))
      setGraph(prev)
      setLayoutDirty(true)
      return p.slice(0, -1)
    })
  }, [])
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f
      const next = f[0]
      setPast((p) => [...p.slice(-49), graphRef.current])
      setGraph(next)
      setLayoutDirty(true)
      return f.slice(1)
    })
  }, [])

  // ---- live status (heartbeats) ---------------------------------------------
  useEffect(() => {
    let alive = true
    const load = async () => {
      const st = await fetchStructureStatus()
      if (alive && st) setLive(st)
    }
    load()
    const t = setInterval(load, 20_000)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  // ---- view -----------------------------------------------------------------
  const toStage = useCallback((clientX: number, clientY: number) => {
    const r = wrapRef.current!.getBoundingClientRect()
    return { x: (clientX - r.left - view.x) / view.k, y: (clientY - r.top - view.y) / view.k }
  }, [view])

  const fit = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const xs: number[] = [], ys: number[] = []
    graph.frames.forEach((f) => { xs.push(f.x, f.x + f.w); ys.push(f.y - 20, f.y + f.h) })
    graph.nodes.forEach((n) => { xs.push(n.x, n.x + NODE_W); ys.push(n.y, n.y + nodeHeight(n)) })
    if (!xs.length) return
    const minX = Math.min(...xs) - 30, maxX = Math.max(...xs) + 30, minY = Math.min(...ys) - 30, maxY = Math.max(...ys) + 30
    const k = Math.min(1.1, Math.max(0.3, Math.min(r.width / (maxX - minX), r.height / (maxY - minY))))
    setView({ k, x: (r.width - (maxX - minX) * k) / 2 - minX * k, y: 16 - minY * k })
  }, [graph])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fit() }, [])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const stop = (e: WheelEvent) => e.preventDefault()
    el.addEventListener('wheel', stop, { passive: false })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  // ---- mutations ------------------------------------------------------------
  const updateNode = (key: string, patch: Partial<GNode>) =>
    setGraph((g) => ({ ...g, nodes: g.nodes.map((n) => (n.key === key ? ({ ...n, ...patch } as GNode) : n)) }))

  const pruneEdges = (g: Graph): Graph => ({
    ...g,
    edges: g.edges.filter((e) => {
      const a = g.nodes.find((n) => n.key === e.from), b = g.nodes.find((n) => n.key === e.to)
      if (!a || !b) return false
      return pinsOf(a).some((p) => p.dir === 'out' && p.kind === e.kind) && pinsOf(b).some((p) => p.dir === 'in' && p.kind === e.kind)
    }),
  })

  const connect = (from: string, to: string, kind: Kind) => {
    const a = byKey.get(from), b = byKey.get(to)
    if (!a || !b) return
    if (from === to) { notify('Wbudowany sprzęt tego urządzenia wybierzesz w panelu po prawej.'); return }
    if (kind === 'sale' && graph.edges.some((e) => e.from === from && e.to === to && e.kind === 'sale')) { notify('To połączenie już istnieje'); return }
    const prev = kind !== 'sale' ? graph.edges.find((e) => e.from === from && e.kind === kind) : undefined
    const key = `e:${kind}:${from}:${to}:${tempId()}`
    snapshot()
    setGraph((g) => {
      let edges = g.edges
      let nodes = g.nodes
      if (kind !== 'sale') {
        edges = edges.filter((e) => !(e.from === from && e.kind === kind))
        nodes = nodes.map((n) => (n.key === from && n.type === 'terminal'
          ? ({ ...n, self: { ...n.self, [kind]: false }, raw: { ...n.raw, [kind]: undefined } } as GNode)
          : n))
      }
      return { ...g, nodes, edges: [...edges, { key, from, to, kind }] }
    })
    setSel({ type: 'edge', key })
    if (kind === 'sale') notify(`„${a.name}” sprzedawana na „${b.name}”`)
    else notify(prev ? `${KIND_LABEL[kind]}: zamieniono „${byKey.get(prev.to)?.name}” na „${b.name}”` : `${a.name} → ${b.name}: ${KIND_LABEL[kind].toLowerCase()}`)
  }

  const removeEdge = (key: string) => {
    snapshot()
    setGraph((g) => ({ ...g, edges: g.edges.filter((e) => e.key !== key) }))
    if (sel?.key === key) setSel(null)
  }

  const setDeviceTarget = (term: TerminalNode, kind: DeviceKind, value: string) => {
    snapshot()
    setGraph((g) => {
      const edges = g.edges.filter((e) => !(e.from === term.key && e.kind === kind))
      const self = { ...term.self, [kind]: value === '__self' }
      const raw = { ...term.raw, [kind]: value.startsWith('__raw:') ? value.slice(6) : undefined }
      const nodes = g.nodes.map((n) => (n.key === term.key ? ({ ...n, self, raw } as GNode) : n))
      if (value && !value.startsWith('__')) edges.push({ key: `e:${kind}:${term.key}:${value}:${tempId()}`, from: term.key, to: value, kind })
      return { ...g, nodes, edges }
    })
  }

  const toggleBrand = (term: TerminalNode, brandKey: string, on: boolean) => {
    snapshot()
    setGraph((g) => ({
      ...g,
      edges: on
        ? [...g.edges, { key: `e:sale:${brandKey}:${term.key}:${tempId()}`, from: brandKey, to: term.key, kind: 'sale' as Kind }]
        : g.edges.filter((e) => !(e.from === brandKey && e.to === term.key && e.kind === 'sale')),
    }))
  }

  /** Put a node into a frame, below whatever already sits in its column (grows the frame if needed). */
  const moveIntoFrame = (nodeKey: string, frameKey: string, record = true) => {
    if (record) snapshot()
    setGraph((g) => {
      const f = g.frames.find((x) => x.key === frameKey)
      const n = g.nodes.find((x) => x.key === nodeKey)
      if (!f || !n) return g
      const colX = f.x + (n.type === 'brand' ? 30 : n.type === 'terminal' ? 310 : 600)
      const colMembers = g.nodes.filter((m) => m.key !== nodeKey && frameOfNode(g.frames, m)?.key === f.key && Math.abs(m.x - colX) < NODE_W)
      const y = colMembers.reduce((acc, m) => Math.max(acc, m.y + nodeHeight(m) + 24), f.y + 40)
      const frames = g.frames.map((x) => (x.key === f.key ? { ...x, h: Math.max(x.h, y - x.y + nodeHeight(n) + 30) } : x))
      return { ...g, frames, nodes: g.nodes.map((m) => (m.key === nodeKey ? ({ ...m, x: colX, y } as GNode) : m)) }
    })
    setLayoutDirty(true)
  }

  const addTerminal = () => {
    const target = (sel?.type === 'frame' && graph.frames.find((f) => f.key === sel.key)) || graph.frames.find((f) => f.key !== NONE_FRAME) || graph.frames[0]
    const t = tempId()
    const node: TerminalNode = {
      type: 'terminal', key: `term:new:${t}`, tempId: t, code: null, name: `Nowe stanowisko (${ROLE_INFO[addRole].name})`,
      role: addRole, status: 'new', hardware: false, lastActive: null, self: {}, raw: {}, x: target.x + 310, y: target.y + 40,
    }
    snapshot()
    setGraph((g) => ({ ...g, nodes: [...g.nodes, node] }))
    setTimeout(() => moveIntoFrame(node.key, target.key, false), 0)
    setSel({ type: 'node', key: node.key })
    notify(`Dodano stanowisko do „${target.name}” — kod parowania pojawi się po zapisie`)
  }

  const addLocation = () => {
    const t = tempId()
    const bottom = graph.frames.reduce((acc, f) => Math.max(acc, f.y + f.h), 0)
    const frame: Frame = { key: `loc:new:${t}`, tempId: t, locationId: null, name: 'Nowa lokalizacja', x: 0, y: bottom + 60, w: 860, h: 240 }
    snapshot()
    setGraph((g) => ({ ...g, frames: [...g.frames, frame] }))
    setSel({ type: 'frame', key: frame.key })
    notify('Dodano lokalizację — nadaj jej nazwę w panelu po prawej')
  }

  /** Ready-made venue: a new location with typical stations (devices and brands are connected afterwards). */
  const addTemplate = (id: string) => {
    const tpl = TEMPLATES[id]
    if (!tpl) return
    const t = tempId()
    const bottom = graph.frames.reduce((acc, f) => Math.max(acc, f.y + f.h), 0)
    const y0 = bottom + 60
    const nodes: TerminalNode[] = []
    let y = y0 + 40
    tpl.stations.forEach((st) => {
      const nt = tempId()
      const node: TerminalNode = {
        type: 'terminal', key: `term:new:${nt}`, tempId: nt, code: null, name: st.name, role: st.role,
        status: 'new', hardware: false, lastActive: null, self: {}, raw: {}, x: 310, y,
      }
      nodes.push(node)
      y += nodeHeight(node) + 24
    })
    const frame: Frame = { key: `loc:new:${t}`, tempId: t, locationId: null, name: tpl.location, x: 0, y: y0, w: 860, h: Math.max(240, y - y0 + 20) }
    snapshot()
    setGraph((g) => ({ ...g, frames: [...g.frames, frame], nodes: [...g.nodes, ...nodes] }))
    setSel({ type: 'frame', key: frame.key })
    notify(`Dodano „${tpl.location}” z ${nodes.length} stanowiskami — podłącz marki i urządzenia, potem zapisz`)
    setTimeout(fit, 0)
  }

  const removeNewNode = (key: string) => {
    snapshot()
    setGraph((g) => ({ ...g, nodes: g.nodes.filter((n) => n.key !== key), edges: g.edges.filter((e) => e.from !== key && e.to !== key) }))
    setSel(null)
  }
  const removeNewFrame = (key: string) => { snapshot(); setGraph((g) => ({ ...g, frames: g.frames.filter((f) => f.key !== key) })); setSel(null) }

  const resetAll = () => {
    if (dirty && !confirm('Odrzucić niezapisane zmiany?')) return
    setGraph(buildGraph(original)); setLayoutDirty(false); setSel(null); setPast([]); setFuture([])
  }

  const save = async () => {
    const blocking = issues.filter((i) => i.level === 'err')
    if (blocking.length && !confirm(`Struktura ma ${blocking.length} błędów blokujących sprzedaż. Zapisać mimo to?`)) return
    setSaving(true)
    try {
      const res = await saveStructure(payload)
      if (!res.ok || !res.data) {
        const details = res.errors ? ' — ' + Object.values(res.errors).join(' · ') : ''
        notify((res.message || 'Nie udało się zapisać struktury') + details, true)
        return
      }
      setOriginal(res.data)
      setGraph(buildGraph(res.data))
      setLayoutDirty(false)
      setSel(null)
      setPast([])
      setFuture([])
      fetchStructureStatus().then((st) => st && setLive(st))
      notify('Zapisano — stanowiska korzystają z nowej konfiguracji')
    } finally {
      setSaving(false)
    }
  }

  // ---- pointer interactions ---------------------------------------------------
  const pinFromPoint = (x: number, y: number) =>
    ((document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-pin]') as HTMLElement | null)

  const onPointerDown = (ev: React.PointerEvent) => {
    const t = ev.target as HTMLElement
    if (t.closest('[data-ui]')) return
    const pin = t.closest('[data-pin]') as HTMLElement | null
    const node = t.closest('[data-node]') as HTMLElement | null
    const edge = t.closest('[data-edge]') as Element | null
    const head = t.closest('[data-frame-head]') as HTMLElement | null
    const resize = t.closest('[data-frame-resize]') as HTMLElement | null
    wrapRef.current?.setPointerCapture(ev.pointerId)
    const p = toStage(ev.clientX, ev.clientY)

    if (pin) {
      const [key, dir, kind] = pin.dataset.pin!.split('|')
      setDrag({ mode: 'wire', key, dir: dir as 'in' | 'out', kind: kind as Kind, cur: p })
    } else if (node) {
      const n = byKey.get(node.dataset.node!)!
      setDrag({ mode: 'node', key: n.key, ox: p.x - n.x, oy: p.y - n.y, moved: false })
      setSel({ type: 'node', key: n.key })
    } else if (resize) {
      const f = graph.frames.find((x) => x.key === resize.dataset.frameResize)!
      snapshot()
      setDrag({ mode: 'resize', key: f.key, sx: p.x, sy: p.y, w: f.w, h: f.h })
    } else if (head) {
      const f = graph.frames.find((x) => x.key === head.dataset.frameHead)!
      const members = graph.nodes.filter((n) => frameOfNode(graph.frames, n)?.key === f.key).map((n) => ({ key: n.key, x: n.x, y: n.y }))
      setDrag({ mode: 'frame', key: f.key, sx: p.x, sy: p.y, fx: f.x, fy: f.y, members, moved: false })
      setSel({ type: 'frame', key: f.key })
    } else if (edge) {
      setSel({ type: 'edge', key: edge.getAttribute('data-edge')! })
    } else {
      setDrag({ mode: 'pan', sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y, moved: false })
    }
  }

  const onPointerMove = (ev: React.PointerEvent) => {
    if (!drag) return
    const p = toStage(ev.clientX, ev.clientY)
    if (drag.mode === 'node') {
      if (!drag.moved) { snapshot(); setDrag({ ...drag, moved: true }) }
      updateNode(drag.key, { x: Math.round((p.x - drag.ox) / 10) * 10, y: Math.round((p.y - drag.oy) / 10) * 10 })
    } else if (drag.mode === 'frame') {
      const dx = Math.round((p.x - drag.sx) / 10) * 10, dy = Math.round((p.y - drag.sy) / 10) * 10
      if (!drag.moved) { snapshot(); setDrag({ ...drag, moved: true }) }
      setGraph((g) => ({
        ...g,
        frames: g.frames.map((f) => (f.key === drag.key ? { ...f, x: drag.fx + dx, y: drag.fy + dy } : f)),
        nodes: g.nodes.map((n) => { const m = drag.members.find((x) => x.key === n.key); return m ? ({ ...n, x: m.x + dx, y: m.y + dy } as GNode) : n }),
      }))
    } else if (drag.mode === 'resize') {
      const w = Math.max(320, Math.round((drag.w + p.x - drag.sx) / 10) * 10)
      const h = Math.max(140, Math.round((drag.h + p.y - drag.sy) / 10) * 10)
      setGraph((g) => ({ ...g, frames: g.frames.map((f) => (f.key === drag.key ? { ...f, w, h } : f)) }))
    } else if (drag.mode === 'wire') {
      setDrag({ ...drag, cur: p })
      const over = pinFromPoint(ev.clientX, ev.clientY)
      if (over) {
        const [, dir, kind] = over.dataset.pin!.split('|')
        setHotPin(dir !== drag.dir && kind === drag.kind ? over.dataset.pin! : null)
      } else setHotPin(null)
    } else if (drag.mode === 'pan') {
      setView((v) => ({ ...v, x: drag.vx + ev.clientX - drag.sx, y: drag.vy + ev.clientY - drag.sy }))
      if (!drag.moved && Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) > 3) setDrag({ ...drag, moved: true })
    }
  }

  const onPointerUp = (ev: React.PointerEvent) => {
    if (!drag) return
    if (drag.mode === 'wire') {
      const over = pinFromPoint(ev.clientX, ev.clientY)
      if (over) {
        const [key, dir, kind] = over.dataset.pin!.split('|')
        if (dir === drag.dir) notify('Połącz wyjście (kropka po prawej) z wejściem (kropka po lewej)')
        else if (kind !== drag.kind) notify(`Tu pasuje tylko połączenie „${KIND_LABEL[drag.kind]}” — kolory kropek muszą się zgadzać`)
        else connect(drag.dir === 'out' ? drag.key : key, drag.dir === 'out' ? key : drag.key, drag.kind)
      }
      setHotPin(null)
    } else if (drag.mode === 'node' && drag.moved) {
      setLayoutDirty(true)
      const n = byKey.get(drag.key)
      if (n && n.type !== 'device') {
        const f = frameOfNode(graph.frames, n)
        if (f) notify(f.key === NONE_FRAME ? `„${n.name}” — poza lokalizacją` : `„${n.name}” → ${f.name}`)
      }
    } else if (drag.mode === 'frame' || drag.mode === 'resize') {
      setLayoutDirty(true)
    } else if (drag.mode === 'pan' && !drag.moved) {
      setSel(null)
    }
    setDrag(null)
  }

  const onWheel = (ev: React.WheelEvent) => {
    const r = wrapRef.current!.getBoundingClientRect()
    const mx = ev.clientX - r.left, my = ev.clientY - r.top
    setView((v) => {
      const k = Math.min(1.6, Math.max(0.3, v.k * (ev.deltaY < 0 ? 1.1 : 0.9)))
      return { k, x: mx - (mx - v.x) * (k / v.k), y: my - (my - v.y) * (k / v.k) }
    })
  }
  const zoom = (f: number) => {
    const r = wrapRef.current!.getBoundingClientRect()
    const mx = r.width / 2, my = r.height / 2
    setView((v) => { const k = Math.min(1.6, Math.max(0.3, v.k * f)); return { k, x: mx - (mx - v.x) * (k / v.k), y: my - (my - v.y) * (k / v.k) } })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toUpperCase()
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
      if (mod && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) { e.preventDefault(); redo(); return }
      if (e.key === 'Escape') setSel(null)
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel?.type === 'edge') removeEdge(sel.key)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---- render ------------------------------------------------------------------
  const worstFor = (key: string) => {
    const lv = issues.filter((i) => i.node === key).map((i) => i.level)
    return lv.includes('err') ? 'err' : lv.includes('warn') ? 'warn' : null
  }

  const wirePaths = graph.edges.map((e) => {
    const a = byKey.get(e.from), b = byKey.get(e.to)
    const pa = a && pinPoint(a, 'out', e.kind), pb = b && pinPoint(b, 'in', e.kind)
    if (!pa || !pb) return null
    const d = curve(pa, pb)
    const active = sel?.key === e.key || sel?.key === e.from || sel?.key === e.to
    return (
      <g key={e.key}>
        <path d={d} fill="none" stroke={KIND_VAR[e.kind]} strokeWidth={sel?.key === e.key ? 4 : active ? 3 : 2.3}
          strokeDasharray={e.kind === 'print' ? '6 4' : undefined} opacity={sel && !active ? 0.4 : 0.95} />
        <path className={s.hit} d={d} data-edge={e.key} />
      </g>
    )
  })

  let tempWire: React.ReactNode = null
  if (drag?.mode === 'wire') {
    const n = byKey.get(drag.key)
    const p0 = n && pinPoint(n, drag.dir, drag.kind)
    if (p0) {
      const [a, b] = drag.dir === 'out' ? [p0, drag.cur] : [drag.cur, p0]
      tempWire = <path d={curve(a, b)} fill="none" stroke={KIND_VAR[drag.kind]} strokeWidth={2.5} strokeDasharray="4 4" />
    }
  }

  const selNode = sel?.type === 'node' ? byKey.get(sel.key) : undefined
  const selEdge = sel?.type === 'edge' ? graph.edges.find((e) => e.key === sel.key) : undefined
  const selFrame = sel?.type === 'frame' ? graph.frames.find((f) => f.key === sel.key) : undefined

  return (
    <div className={s.root}>
      <div className={s.toolbar}>
        <select id="structure-add-role" className={s.tselect} value={addRole} onChange={(e) => setAddRole(e.target.value as Role)} aria-label="Rola nowego stanowiska">
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_INFO[r].name}</option>)}
        </select>
        <button className={s.tbtn} onClick={addTerminal}>+ Stanowisko</button>
        <button className={s.tbtn} onClick={addLocation}>+ Lokalizacja</button>
        <select id="structure-template" className={s.tselect} value="" onChange={(e) => { addTemplate(e.target.value); e.target.value = '' }} aria-label="Dodaj gotowy szablon lokalu">
          <option value="">+ Szablon lokalu…</option>
          {Object.entries(TEMPLATES).map(([id, t]) => <option key={id} value={id}>{t.label}</option>)}
        </select>
        <button className={s.tbtn} onClick={undo} disabled={!past.length} title="Cofnij (Ctrl/⌘+Z)" aria-label="Cofnij">↶</button>
        <button className={s.tbtn} onClick={redo} disabled={!future.length} title="Ponów (Ctrl/⌘+Shift+Z)" aria-label="Ponów">↷</button>
        <Link className={s.tbtn} href="/dashboard/brands">Marki…</Link>
        <Link className={s.tbtn} href="/dashboard/fiscal-devices">Urządzenia…</Link>
        <span className={s.spacer} />
        {dirty && <span className={s.dirty}>Niezapisane zmiany{changes ? ` (${changes})` : ''}</span>}
        <button className={s.tbtn} onClick={resetAll} disabled={!dirty || saving}>Odrzuć</button>
        <button className={`${s.tbtn} ${s.primary}`} onClick={save} disabled={!dirty || saving}>{saving ? 'Zapisywanie…' : 'Zapisz strukturę'}</button>
      </div>

      <div className={s.legend} aria-label="Legenda połączeń">
        <span className={s.kSale}><i /><em className={s.legendText}>marka → stanowisko</em></span>
        <span className={s.kFiscal}><i /><em className={s.legendText}>fiskalizacja</em></span>
        <span className={s.kPay}><i /><em className={s.legendText}>płatność kartą</em></span>
        <span className={`${s.kPrint} ${s.kprint}`}><i /><em className={s.legendText}>wydruk</em></span>
        <span className={s.legendHint}>Przeciągnij linię z kropki do kropki tego samego koloru · kółko myszy = zoom · przeciągnij tło = przesuń</span>
      </div>

      <div className={s.body}>
        <div ref={wrapRef} className={s.canvas} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
          onWheel={onWheel} role="application" aria-label="Schemat struktury lokalu">
          <div className={s.stage} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
            {graph.frames.map((f) => (
              <div key={f.key} className={`${s.frame} ${f.key === NONE_FRAME ? s.frameNone : ''} ${sel?.key === f.key ? s.frameSel : ''}`}
                style={{ left: f.x, top: f.y, width: f.w, height: f.h }}>
                <div className={s.frameHead} data-frame-head={f.key}>
                  {f.name}
                  <small>{f.locationId ? `#${f.locationId}` : f.tempId ? 'nowa' : ''}{f.tables && f.tables.length ? ` · ${f.tables.length} stolików` : ''}</small>
                </div>
                <div className={s.resize} data-frame-resize={f.key} title="Zmień rozmiar" />
              </div>
            ))}

            <svg className={s.wires} aria-hidden="true">{wirePaths}{tempWire}</svg>

            {graph.nodes.map((n) => {
              const w = worstFor(n.key)
              const term = n.type === 'terminal' ? n : null
              const glyph = n.type === 'brand' ? <div className={`${s.glyph} ${s.gBrand}`}>M</div>
                : n.type === 'device' ? <div className={`${s.glyph} ${s.gDev}`}>{n.kind === 'hub' ? 'SBF' : 'SBR'}</div>
                : <div className={`${s.glyph} ${n.hardware ? s.gHw : s.gTerm}`}>{ROLE_INFO[n.role].short}</div>
              const sub = n.type === 'brand' ? `/${n.slug} · ${n.tables ? `własne stoliki: ${n.tables.length}` : 'stoliki lokalizacji'}`
                : n.type === 'device' ? <>{n.kind === 'hub' ? 'Hub fiskalny' : 'Urządzenie SBR'} · <span className={s.mono}>{n.deviceId}</span></>
                : <>{ROLE_INFO[n.role].name} · <span className={s.mono}>{n.code ?? 'nowe'}</span></>
              const statusDot = w === 'err' ? s.dotErr : w === 'warn' ? s.dotWarn : s.dotOk
              const presence = presenceOf(n, live)
              return (
                <div key={n.key} data-node={n.key} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSel({ type: 'node', key: n.key }) }}
                  className={`${s.node} ${sel?.key === n.key ? s.nodeSel : ''} ${w === 'err' ? s.nodeErr : ''} ${term?.tempId ? s.nodeNew : ''} ${presence ? (presence.online ? s.online : s.offline) : ''}`}
                  title={presence ? presence.label : undefined}
                  style={{ left: n.x, top: n.y }}>
                  <span className={`${s.dot} ${statusDot}`} title={w === 'err' ? 'Błąd konfiguracji' : w === 'warn' ? 'Do sprawdzenia' : 'Konfiguracja OK'} />
                  {presence && <span className={`${s.presence} ${presence.online ? s.presenceOn : s.presenceOff}`}>{presence.online ? 'online' : presence.short}</span>}
                  <div className={s.head}>{glyph}<div><b>{n.name}</b><small>{sub}</small></div></div>
                  <div className={s.pins}>
                    {pinsOf(n).map((p) => {
                      const id = `${n.key}|${p.dir}|${p.kind}`
                      const k = p.kind as DeviceKind
                      const builtIn = !!term && p.dir === 'out' && p.kind !== 'sale' &&
                        (!!term.self[k] || (term.hardware && !graph.edges.some((e) => e.from === n.key && e.kind === p.kind) && !term.raw[k]))
                      return (
                        <div key={id} className={`${s.pinRow} ${p.dir === 'out' ? s.pinOut : ''}`}>
                          {p.label}{builtIn && <span className={s.chip}>wbudowana</span>}
                          <span className={`${s.pin} ${KIND_CLASS[p.kind]} ${hotPin === id ? s.pinHot : ''}`} data-pin={id} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div className={s.zoom} data-ui>
            <button className={s.tbtn} onClick={() => zoom(1 / 1.15)} aria-label="Pomniejsz">−</button>
            <button className={s.tbtn} onClick={fit}>Dopasuj</button>
            <button className={s.tbtn} onClick={() => zoom(1.15)} aria-label="Powiększ">+</button>
          </div>
        </div>

        <aside className={s.panel} aria-label="Właściwości">
          {selNode?.type === 'terminal' && (
            <TerminalPanel
              n={selNode} graph={graph} live={live} issues={issues.filter((i) => i.node === selNode.key)}
              onRename={(name) => updateNode(selNode.key, { name })}
              onEditStart={snapshot}
              onRole={(role) => { snapshot(); setGraph((g) => pruneEdges({ ...g, nodes: g.nodes.map((x) => (x.key === selNode.key ? ({ ...x, role } as GNode) : x)) })) }}
              onDevice={(k, v) => setDeviceTarget(selNode, k, v)}
              onBrand={(bk, on) => toggleBrand(selNode, bk, on)}
              onLocation={(fk) => moveIntoFrame(selNode.key, fk)}
              onRemoveNew={() => removeNewNode(selNode.key)}
            />
          )}
          {selNode?.type === 'brand' && (
            <BrandPanel n={selNode} graph={graph} issues={issues.filter((i) => i.node === selNode.key)}
              onLocation={(fk) => moveIntoFrame(selNode.key, fk)} onRemoveEdge={removeEdge}
              onTables={(tables) => { snapshot(); updateNode(selNode.key, { tables } as Partial<GNode>) }} />
          )}
          {selNode?.type === 'device' && (
            <DevicePanel n={selNode} graph={graph} live={live} issues={issues.filter((i) => i.node === selNode.key)} onRemoveEdge={removeEdge} />
          )}
          {selEdge && (
            <>
              <h3>Połączenie</h3>
              <div className={`${s.row} ${KIND_CLASS[selEdge.kind]}`}><span className={s.rowText}>{KIND_LABEL[selEdge.kind]}</span></div>
              <p className={s.muted}>{byKey.get(selEdge.from)?.name} → {byKey.get(selEdge.to)?.name}</p>
              <button className={s.tbtn} onClick={() => removeEdge(selEdge.key)}>Usuń połączenie</button>
            </>
          )}
          {selFrame && (
            <>
              <h3>{selFrame.key === NONE_FRAME ? 'Obszar poza lokalizacją' : 'Lokalizacja'}</h3>
              {selFrame.key !== NONE_FRAME ? (
                <div className={s.field}>
                  <label htmlFor="frame-name">Nazwa</label>
                  <input id="frame-name" className={s.input} value={selFrame.name} onFocus={snapshot}
                    onChange={(e) => setGraph((g) => ({ ...g, frames: g.frames.map((f) => (f.key === selFrame.key ? { ...f, name: e.target.value } : f)) }))} />
                </div>
              ) : <p className={s.muted}>Elementy w tym obszarze nie mają przypisanej lokalizacji.</p>}
              {selFrame.key !== NONE_FRAME && (
                <div className={s.field}>
                  <label htmlFor="frame-tables">Stoliki lokalizacji</label>
                  <TablesEditor id="frame-tables" value={selFrame.tables || []}
                    placeholder={selFrame.tempId ? 'puste = domyślne (1–10, Bar, Ogródek 1–2)' : 'np. 1, 2, 3, Bar'}
                    onCommit={(tables) => { snapshot(); setGraph((g) => ({ ...g, frames: g.frames.map((f) => (f.key === selFrame.key ? { ...f, tables } : f)) })) }} />
                  <span className={s.muted}>Marki bez własnych stolików korzystają z tej listy (QR na stolikach, wybór stolika na POS).</span>
                </div>
              )}
              <p className={s.muted}>Przeciągnij nagłówek ramki, aby przesunąć ją razem z zawartością; uchwyt w prawym dolnym rogu zmienia rozmiar.</p>
              {selFrame.tempId && !graph.nodes.some((n) => frameOfNode(graph.frames, n)?.key === selFrame.key) && (
                <button className={s.tbtn} onClick={() => removeNewFrame(selFrame.key)}>Usuń pustą lokalizację</button>
              )}
              {selFrame.locationId && <Link className={s.link} href="/dashboard/locations">Stoły, adres i ustawienia lokalizacji →</Link>}
            </>
          )}
          {!sel && <IssuesPanel issues={issues} graph={graph} live={live} onPick={(key) => setSel({ type: 'node', key })} />}
        </aside>
      </div>

      {toast && <div className={`${s.toast} ${toast.err ? s.toastErr : ''}`} role="status" aria-live="polite">{toast.msg}</div>}
    </div>
  )
}
