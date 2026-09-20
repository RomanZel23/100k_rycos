// Pure data model of the graphical structure editor (no React here).
// Converts the /v1/admin/structure payload into a graph, validates it,
// and turns the edited graph back into a save payload.

export type Kind = 'sale' | 'fiscal' | 'pay' | 'print'
export type DeviceKind = 'fiscal' | 'pay' | 'print'
export type Role = 'all_in_one' | 'pos' | 'kds' | 'pickup' | 'kiosk' | 'fiscal_hub'

export interface ApiLocation { id: number; name: string; is_active: boolean; tables?: string[] }
export interface ApiBrand { id: number; name: string; slug: string; location_id: number | null; is_active: boolean; tables?: string[] | null }
export interface ApiTerminal {
  id: number
  terminal_id: string
  name: string
  role: string
  status: string
  location_id: number | null
  assigned_brand_ids: number[]
  printer_device_id: string | null
  tap_device_id: string | null
  fiscal_device_id: string | null
  is_hardware: boolean
  last_active: string | null
}
export interface ApiDevice {
  id: number
  device_id: string
  name: string
  kind: string
  source: string
  status: string
  is_primary: boolean
  is_online: boolean
  last_seen: string | null
}
export interface Layout {
  nodes?: Record<string, { x: number; y: number }>
  frames?: Record<string, { x: number; y: number; w: number; h: number }>
}
export interface ApiStructure {
  locations: ApiLocation[]
  brands: ApiBrand[]
  terminals: ApiTerminal[]
  fiscal_devices: ApiDevice[]
  layout: Layout | null
}

export const KIND_LABEL: Record<Kind, string> = {
  sale: 'Sprzedaż marki',
  fiscal: 'Fiskalizacja',
  pay: 'Płatność kartą',
  print: 'Wydruk',
}
export const DEVICE_FIELD: Record<DeviceKind, 'fiscal_device_id' | 'tap_device_id' | 'printer_device_id'> = {
  fiscal: 'fiscal_device_id',
  pay: 'tap_device_id',
  print: 'printer_device_id',
}
export const ROLE_INFO: Record<Role, { name: string; short: string; sells: boolean; outputs: DeviceKind[]; brandInput: boolean }> = {
  all_in_one: { name: 'All-in-One', short: 'AIO', sells: true, outputs: ['fiscal', 'pay', 'print'], brandInput: true },
  pos: { name: 'Kasa POS', short: 'POS', sells: true, outputs: ['fiscal', 'pay', 'print'], brandInput: true },
  kiosk: { name: 'Kiosk', short: 'KIO', sells: true, outputs: ['fiscal', 'pay', 'print'], brandInput: true },
  kds: { name: 'Kuchnia KDS', short: 'KDS', sells: false, outputs: ['print'], brandInput: true },
  pickup: { name: 'Wydawka', short: 'WYD', sells: false, outputs: [], brandInput: true },
  fiscal_hub: { name: 'Hub fiskalny', short: 'HUB', sells: false, outputs: [], brandInput: false },
}
export const ROLES = Object.keys(ROLE_INFO) as Role[]

export interface Frame {
  key: string // loc:<id> | loc:new:<tmp> | loc:none
  locationId: number | null
  tempId?: string
  name: string
  /** table labels of the location (undefined for a new location = server defaults) */
  tables?: string[]
  x: number
  y: number
  w: number
  h: number
}

interface BaseNode { key: string; x: number; y: number; name: string }
export interface BrandNode extends BaseNode { type: 'brand'; id: number; slug: string; active: boolean; /** own tables; null = uses the location's tables */ tables: string[] | null }
export interface TerminalNode extends BaseNode {
  type: 'terminal'
  id?: number
  tempId?: string
  code: string | null // setup code / terminal_id (null for unsaved)
  role: Role
  status: string
  hardware: boolean
  lastActive: string | null
  /** 'self' assignments (built-in hardware of this device) */
  self: Partial<Record<DeviceKind, boolean>>
  /** values that do not map to anything on the canvas — preserved on save */
  raw: Partial<Record<DeviceKind, string>>
}
export interface DeviceNode extends BaseNode {
  type: 'device'
  id: number
  deviceId: string
  kind: string
  online: boolean
  primary: boolean
  status: string
}
export type GNode = BrandNode | TerminalNode | DeviceNode

export interface Edge { key: string; from: string; to: string; kind: Kind }

export interface Graph { frames: Frame[]; nodes: GNode[]; edges: Edge[] }

export const NODE_W = 210
export const HEAD_H = 54
export const PIN_TOP = 4
export const PIN_H = 22
export const NONE_FRAME = 'loc:none'

export interface Pin { dir: 'in' | 'out'; kind: Kind; label: string }

export function pinsOf(n: GNode): Pin[] {
  if (n.type === 'brand') return [{ dir: 'out', kind: 'sale', label: 'sprzedawana na' }]
  if (n.type === 'device') {
    const caps: DeviceKind[] = n.kind === 'hub' ? ['fiscal'] : ['fiscal', 'pay', 'print']
    return caps.map((k) => ({ dir: 'in', kind: k, label: KIND_LABEL[k].toLowerCase() }))
  }
  const info = ROLE_INFO[n.role]
  const pins: Pin[] = []
  if (info.brandInput) pins.push({ dir: 'in', kind: 'sale', label: info.sells ? 'sprzedaje marki' : 'widzi zamówienia marek' })
  info.outputs.forEach((k) => pins.push({ dir: 'out', kind: k, label: `→ ${KIND_LABEL[k].toLowerCase()}` }))
  if (n.hardware) {
    ;(['fiscal', 'pay', 'print'] as DeviceKind[]).forEach((k) =>
      pins.push({ dir: 'in', kind: k, label: `udostępnia: ${KIND_LABEL[k].toLowerCase()}` })
    )
  }
  return pins
}

export function nodeHeight(n: GNode): number {
  return HEAD_H + PIN_TOP * 2 + pinsOf(n).length * PIN_H + 2
}

export function pinPoint(n: GNode, dir: 'in' | 'out', kind: Kind): { x: number; y: number } | null {
  const idx = pinsOf(n).findIndex((p) => p.dir === dir && p.kind === kind)
  if (idx < 0) return null
  return { x: dir === 'out' ? n.x + NODE_W : n.x, y: n.y + HEAD_H + PIN_TOP + idx * PIN_H + PIN_H / 2 }
}

export function frameOfPoint(frames: Frame[], x: number, y: number): Frame | null {
  // real locations win over the "outside" area
  const inside = frames.filter((f) => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h)
  return inside.find((f) => f.key !== NONE_FRAME) || inside[0] || null
}
export function frameOfNode(frames: Frame[], n: GNode): Frame | null {
  return frameOfPoint(frames, n.x + NODE_W / 2, n.y + 24)
}

let seq = 0
export function tempId(): string {
  seq += 1
  return `${Date.now().toString(36)}${seq}`
}

/** Canonical device string a terminal field would store for a target node. */
export function deviceRef(n: GNode): string | null {
  if (n.type === 'device') return n.deviceId
  if (n.type === 'terminal') return n.code ?? (n.tempId ? `new:${n.tempId}` : null)
  return null
}

// ---------------------------------------------------------------------------
// API → graph
// ---------------------------------------------------------------------------
export function buildGraph(data: ApiStructure): Graph {
  const layout = data.layout || {}
  const lnodes = layout.nodes || {}
  const lframes = layout.frames || {}

  const nodes: GNode[] = []
  const edges: Edge[] = []

  const termByCode = new Map(data.terminals.map((t) => [t.terminal_id, t]))
  // A fiscal device registered under the same id as a paired SBR terminal is the same box → one node
  const devices = data.fiscal_devices.filter((d) => !termByCode.has(d.device_id))

  data.brands.forEach((b) =>
    nodes.push({ type: 'brand', key: `brand:${b.id}`, id: b.id, name: b.name, slug: b.slug, active: b.is_active, tables: b.tables && b.tables.length ? b.tables : null, x: 0, y: 0 })
  )
  data.terminals.forEach((t) =>
    nodes.push({
      type: 'terminal',
      key: `term:${t.id}`,
      id: t.id,
      code: t.terminal_id,
      name: t.name,
      role: (ROLES.includes(t.role as Role) ? t.role : 'all_in_one') as Role,
      status: t.status,
      hardware: t.is_hardware,
      lastActive: t.last_active,
      self: {},
      raw: {},
      x: 0,
      y: 0,
    })
  )
  devices.forEach((d) =>
    nodes.push({
      type: 'device',
      key: `dev:${d.device_id}`,
      id: d.id,
      deviceId: d.device_id,
      name: d.name,
      kind: d.kind,
      online: d.is_online,
      primary: d.is_primary,
      status: d.status,
      x: 0,
      y: 0,
    })
  )

  const keyByRef = new Map<string, string>()
  data.terminals.forEach((t) => keyByRef.set(t.terminal_id, `term:${t.id}`))
  devices.forEach((d) => keyByRef.set(d.device_id, `dev:${d.device_id}`))

  // edges: brand → terminal
  const brandIds = new Set(data.brands.map((b) => b.id))
  data.terminals.forEach((t) => {
    ;(t.assigned_brand_ids || []).forEach((bid) => {
      if (brandIds.has(bid)) edges.push({ key: `e:sale:${bid}:${t.id}`, from: `brand:${bid}`, to: `term:${t.id}`, kind: 'sale' })
    })
  })
  // edges: terminal → device
  data.terminals.forEach((t) => {
    const node = nodes.find((n) => n.key === `term:${t.id}`) as TerminalNode
    ;(['fiscal', 'pay', 'print'] as DeviceKind[]).forEach((k) => {
      const v = t[DEVICE_FIELD[k]]
      if (!v) return
      if (v === 'self' || v === t.terminal_id) { node.self[k] = true; return }
      const target = keyByRef.get(v)
      if (target) edges.push({ key: `e:${k}:${t.id}`, from: node.key, to: target, kind: k })
      else node.raw[k] = v
    })
  })

  // frames
  const frames: Frame[] = data.locations.map((l) => ({ key: `loc:${l.id}`, locationId: l.id, name: l.name, tables: l.tables || [], x: 0, y: 0, w: 0, h: 0 }))
  frames.push({ key: NONE_FRAME, locationId: null, name: 'Poza lokalizacją', x: 0, y: 0, w: 0, h: 0 })

  // --- positions: saved layout where available, auto layout otherwise
  const locOfNode = new Map<string, string>()
  data.brands.forEach((b) => locOfNode.set(`brand:${b.id}`, b.location_id ? `loc:${b.location_id}` : NONE_FRAME))
  data.terminals.forEach((t) => locOfNode.set(`term:${t.id}`, t.location_id ? `loc:${t.location_id}` : NONE_FRAME))
  devices.forEach((d) => {
    const user = edges.find((e) => e.to === `dev:${d.device_id}`)
    locOfNode.set(`dev:${d.device_id}`, (user && locOfNode.get(user.from)) || NONE_FRAME)
  })

  const COLS = { brand: 30, terminal: 310, device: 600 }
  let cursorY = 30
  frames.forEach((f) => {
    const members = nodes.filter((n) => (locOfNode.get(n.key) || NONE_FRAME) === f.key)
    if (f.key === NONE_FRAME && members.length === 0 && !lframes[f.key]) {
      Object.assign(f, { x: 0, y: cursorY, w: 860, h: 120 })
      cursorY += 160
      return
    }
    const colHeights = { brand: 50, terminal: 50, device: 50 }
    members.forEach((n) => {
      // an SBR terminal that serves other stations (printer / SoftPOS / fiscal) is drawn in the device column
      const servesOthers = n.type === 'terminal' && edges.some((e) => e.to === n.key && e.kind !== 'sale')
      const col = (servesOthers ? 'device' : n.type) as keyof typeof COLS
      const saved = lnodes[n.key]
      if (saved) { n.x = saved.x; n.y = saved.y; return }
      n.x = COLS[col]
      n.y = cursorY + colHeights[col]
      colHeights[col] += nodeHeight(n) + 26
    })
    const h = Math.max(200, colHeights.brand, colHeights.terminal, colHeights.device) + 10
    const saved = lframes[f.key]
    if (saved) Object.assign(f, saved)
    else Object.assign(f, { x: 0, y: cursorY, w: 860, h })
    cursorY = Math.max(cursorY + h + 50, (saved ? saved.y + saved.h : 0) + 50)
  })

  // Saved frame but auto-placed nodes (e.g. new terminal created elsewhere) — keep them inside their frame
  nodes.forEach((n) => {
    if (lnodes[n.key]) return
    const f = frames.find((fr) => fr.key === (locOfNode.get(n.key) || NONE_FRAME))
    if (f && lframes[f.key]) {
      const col = n.type as keyof typeof COLS
      n.x = f.x + COLS[col]
      n.y = f.y + 50 + Math.floor(Math.random() * Math.max(20, f.h - 160))
    }
  })

  return { frames, nodes, edges }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
export interface Issue { level: 'err' | 'warn' | 'info'; node: string; msg: string }

export function validate(g: Graph): Issue[] {
  const issues: Issue[] = []
  const byKey = new Map(g.nodes.map((n) => [n.key, n]))
  const devices = g.nodes.filter((n): n is DeviceNode => n.type === 'device')
  const primaryFiscal = devices.find((d) => d.primary) || devices.find((d) => d.status === 'active')
  const hardwareTerms = g.nodes.filter((n): n is TerminalNode => n.type === 'terminal' && n.hardware)

  for (const n of g.nodes) {
    const frame = frameOfNode(g.frames, n)
    const inLoc = frame && frame.key !== NONE_FRAME ? frame : null

    if (n.type === 'terminal') {
      const info = ROLE_INFO[n.role]
      const out = (k: DeviceKind) => g.edges.find((e) => e.from === n.key && e.kind === k)
      if (!inLoc) issues.push({ level: 'warn', node: n.key, msg: `„${n.name}” nie ma lokalizacji — przeciągnij je do ramki lokalu.` })

      const brandsIn = g.edges.filter((e) => e.to === n.key && e.kind === 'sale')
      if (info.brandInput && brandsIn.length === 0 && inLoc) {
        const locBrands = g.nodes.filter((b) => b.type === 'brand' && frameOfNode(g.frames, b)?.key === inLoc.key)
        if (info.sells && locBrands.length === 0)
          issues.push({ level: 'err', node: n.key, msg: `„${n.name}” nie ma czego sprzedawać — w lokalizacji „${inLoc.name}” nie ma marek. Podłącz markę.` })
        else if (info.sells)
          issues.push({ level: 'info', node: n.key, msg: `„${n.name}” sprzedaje wszystkie marki z „${inLoc.name}” (brak połączeń = wszystkie).` })
      }
      brandsIn.forEach((e) => {
        const b = byKey.get(e.from)
        const bf = b ? frameOfNode(g.frames, b) : null
        if (b && inLoc && bf && bf.key !== inLoc.key)
          issues.push({ level: 'warn', node: n.key, msg: `Marka „${b.name}” należy do innej lokalizacji niż „${n.name}”.` })
      })

      if (info.outputs.includes('fiscal') && !out('fiscal') && !n.self.fiscal && !n.raw.fiscal) {
        if (n.hardware) issues.push({ level: 'info', node: n.key, msg: `„${n.name}” fiskalizuje na wbudowanej kasie SBR.` })
        else if (primaryFiscal) issues.push({ level: 'warn', node: n.key, msg: `„${n.name}” nie ma kasy fiskalnej — paragony trafią na domyślne urządzenie firmy „${primaryFiscal.name}”.` })
        else issues.push({ level: 'err', node: n.key, msg: `„${n.name}” nie ma kasy fiskalnej — sprzedaż nie zostanie zafiskalizowana.` })
      }
      if (info.outputs.includes('pay') && !out('pay') && !n.self.pay && !n.raw.pay && !n.hardware) {
        issues.push({
          level: 'warn',
          node: n.key,
          msg: hardwareTerms.length
            ? `„${n.name}” nie ma terminala płatniczego — płatność kartą trafi na pierwsze urządzenie SBR firmy.`
            : `„${n.name}” nie ma terminala płatniczego — tylko gotówka.`,
        })
      }
      ;(['fiscal', 'pay', 'print'] as DeviceKind[]).forEach((k) => {
        if (n.raw[k]) issues.push({ level: 'warn', node: n.key, msg: `„${n.name}”: ${KIND_LABEL[k].toLowerCase()} wskazuje na nieznane urządzenie „${n.raw[k]}”.` })
        const e = out(k)
        const d = e ? byKey.get(e.to) : null
        if (d && d.type === 'device' && !d.online) issues.push({ level: 'warn', node: n.key, msg: `„${n.name}” używa urządzenia „${d.name}”, które jest offline.` })
      })
      if (n.status === 'unclaimed' && n.id) issues.push({ level: 'info', node: n.key, msg: `„${n.name}” czeka na sparowanie — kod: ${n.code}.` })
    }

    if (n.type === 'brand') {
      if (!inLoc) issues.push({ level: 'warn', node: n.key, msg: `Marka „${n.name}” nie ma lokalizacji.` })
      if (!n.active) issues.push({ level: 'info', node: n.key, msg: `Marka „${n.name}” jest wyłączona.` })
    }

    if (n.type === 'device' && !g.edges.some((e) => e.to === n.key) && !n.primary) {
      issues.push({ level: 'info', node: n.key, msg: `Urządzenie „${n.name}” (${n.deviceId}) nie jest przypisane do żadnego stanowiska.` })
    }
  }
  const order = { err: 0, warn: 1, info: 2 }
  return issues.sort((a, b) => order[a.level] - order[b.level])
}

// ---------------------------------------------------------------------------
// Graph → save payload (only what changed)
// ---------------------------------------------------------------------------
export function toSavePayload(g: Graph, original: ApiStructure) {
  const byKey = new Map(g.nodes.map((n) => [n.key, n]))
  const locRef = (n: GNode): number | string | null => {
    const f = frameOfNode(g.frames, n)
    if (!f || f.key === NONE_FRAME) return null
    return f.locationId ?? `new:${f.tempId}`
  }

  const sameList = (a: string[] | null | undefined, b: string[] | null | undefined) => JSON.stringify(a || []) === JSON.stringify(b || [])

  const new_locations = g.frames
    .filter((f) => f.tempId)
    .map((f) => ({ temp_id: f.tempId!, name: f.name, ...(f.tables && f.tables.length ? { tables: f.tables } : {}) }))
  const locations = g.frames
    .filter((f) => f.locationId !== null)
    .map((f) => {
      const orig = original.locations.find((l) => l.id === f.locationId)
      const row: { id: number; name?: string; tables?: string[] } = { id: f.locationId! }
      if (orig?.name !== f.name) row.name = f.name
      if (f.tables && !sameList(orig?.tables, f.tables)) row.tables = f.tables
      return row
    })
    .filter((row) => row.name !== undefined || row.tables !== undefined)

  const brands = g.nodes
    .filter((n): n is BrandNode => n.type === 'brand')
    .map((b) => {
      const orig = original.brands.find((x) => x.id === b.id)
      const row: { id: number; location_ref?: number | string | null; tables?: string[] | null } = { id: b.id }
      if ((orig?.location_id ?? null) !== locRef(b)) row.location_ref = locRef(b)
      if (!sameList(orig?.tables, b.tables)) row.tables = b.tables && b.tables.length ? b.tables : null
      return row
    })
    .filter((row) => row.location_ref !== undefined || row.tables !== undefined)

  const termNodes = g.nodes.filter((n): n is TerminalNode => n.type === 'terminal')
  const new_terminals = termNodes.filter((t) => t.tempId).map((t) => ({ temp_id: t.tempId!, name: t.name, role: t.role }))

  const terminals = termNodes
    .map((t) => {
      const brandIds = g.edges
        .filter((e) => e.to === t.key && e.kind === 'sale')
        .map((e) => (byKey.get(e.from) as BrandNode).id)
        .sort((a, b) => a - b)
      const field = (k: DeviceKind): string | null => {
        const e = g.edges.find((x) => x.from === t.key && x.kind === k)
        if (e) {
          const target = byKey.get(e.to)
          return target ? deviceRef(target) : null
        }
        if (t.self[k]) return 'self'
        return t.raw[k] ?? null
      }
      return {
        ref: t.id ?? `new:${t.tempId}`,
        name: t.name,
        role: t.role,
        location_ref: locRef(t),
        assigned_brand_ids: brandIds,
        fiscal_device_id: field('fiscal'),
        tap_device_id: field('pay'),
        printer_device_id: field('print'),
      }
    })
    .filter((row) => {
      if (typeof row.ref !== 'number') return true
      const o = original.terminals.find((x) => x.id === row.ref)
      if (!o) return true
      const norm = (v: string | null) => (v === o.terminal_id ? 'self' : v)
      return (
        o.name !== row.name ||
        o.role !== row.role ||
        (o.location_id ?? null) !== row.location_ref ||
        JSON.stringify([...(o.assigned_brand_ids || [])].sort((a, b) => a - b)) !== JSON.stringify(row.assigned_brand_ids) ||
        norm(o.fiscal_device_id) !== row.fiscal_device_id ||
        norm(o.tap_device_id) !== row.tap_device_id ||
        norm(o.printer_device_id) !== row.printer_device_id
      )
    })

  const layout: Layout = { nodes: {}, frames: {} }
  g.nodes.forEach((n) => { layout.nodes![n.key] = { x: Math.round(n.x), y: Math.round(n.y) } })
  g.frames.forEach((f) => { layout.frames![f.key] = { x: Math.round(f.x), y: Math.round(f.y), w: Math.round(f.w), h: Math.round(f.h) } })

  return { layout, new_locations, locations, brands, new_terminals, terminals }
}

export function changeCount(p: ReturnType<typeof toSavePayload>): number {
  return p.new_locations.length + p.locations.length + p.brands.length + p.terminals.length
}

/** "1, 2, 3\nBar" → ['1','2','3','Bar'] (trimmed, unique, max 500) */
export function parseTables(text: string): string[] {
  return Array.from(new Set(text.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean))).slice(0, 500)
}
