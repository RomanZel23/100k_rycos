'use client'

import Link from 'next/link'
import s from './structure.module.css'
import type { LiveStatus } from './actions'
import {
  Graph, GNode, TerminalNode, BrandNode, DeviceNode, Kind, DeviceKind, Role, Issue,
  KIND_LABEL, ROLE_INFO, ROLES, NONE_FRAME, pinsOf, frameOfNode,
} from './model'

/** "5 min temu" style relative time. */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'nigdy'
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (sec < 60) return `${sec} s temu`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min temu`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} godz. temu`
  return `${Math.round(h / 24)} dni temu`
}

/** Live presence of a station / device from the status poll (null = not applicable / unknown yet). */
export function presenceOf(n: GNode, live: LiveStatus | null): { online: boolean; label: string; short: string } | null {
  if (!live) return null
  if (n.type === 'terminal') {
    if (!n.id) return null
    const st = live.terminals[String(n.id)]
    if (!st) return null
    if (st.status === 'unclaimed') return { online: false, label: 'Niesparowane — czeka na wpisanie kodu na urządzeniu', short: 'niesparowane' }
    return st.online
      ? { online: true, label: `Online — ostatni sygnał ${ago(st.last_active)}`, short: 'online' }
      : { online: false, label: `Offline — ostatni sygnał ${ago(st.last_active)}`, short: st.last_active ? ago(st.last_active) : 'offline' }
  }
  if (n.type === 'device') {
    const st = live.devices[n.deviceId]
    if (!st) return null
    return st.online
      ? { online: true, label: `Online${st.last_seen ? ` — ostatnio widziane ${ago(st.last_seen)}` : ''}`, short: 'online' }
      : { online: false, label: `Offline${st.last_seen ? ` — ostatnio widziane ${ago(st.last_seen)}` : ''}`, short: 'offline' }
  }
  return null
}

function PresenceLine({ n, live }: { n: GNode; live: LiveStatus | null }) {
  const p = presenceOf(n, live)
  if (!p) return null
  return <p className={`${s.muted} ${p.online ? s.presenceTextOn : ''}`}>● {p.label}</p>
}

export const KIND_CLASS: Record<Kind, string> = { sale: s.kSale, fiscal: s.kFiscal, pay: s.kPay, print: s.kPrint }

export function IssueList({ issues, onPick }: { issues: Issue[]; onPick?: (key: string) => void }) {
  if (!issues.length) return null
  return (
    <div className={s.issues}>
      {issues.map((i, idx) => (
        <button key={idx} type="button" onClick={() => onPick?.(i.node)}
          className={`${s.issue} ${i.level === 'err' ? s.iErr : i.level === 'warn' ? s.iWarn : s.iInfo}`}>{i.msg}</button>
      ))}
    </div>
  )
}

export function IssuesPanel({ issues, graph, live, onPick }: { issues: Issue[]; graph: Graph; live: LiveStatus | null; onPick: (k: string) => void }) {
  const errs = issues.filter((i) => i.level === 'err').length
  const warns = issues.filter((i) => i.level === 'warn').length
  const terms = graph.nodes.filter((n) => n.type === 'terminal').length
  const offline = graph.nodes.filter((n) => { const p = presenceOf(n, live); return p && !p.online })
  const online = graph.nodes.filter((n) => presenceOf(n, live)?.online).length
  return (
    <>
      <h3>Kontrola konfiguracji</h3>
      <p className={s.muted}>
        {terms} stanowisk · {errs ? `${errs} błędów blokujących sprzedaż` : 'brak błędów blokujących'}{warns ? ` · ${warns} do sprawdzenia` : ''}.
        Kliknij pozycję, aby przejść do elementu.
      </p>
      {live && (
        <div className={s.field}>
          <span className={s.fieldLabel}>Stan urządzeń na żywo · {online} online · {offline.length} offline</span>
          {offline.map((n) => (
            <button key={n.key} type="button" className={`${s.issue} ${s.iInfo}`} onClick={() => onPick(n.key)}>
              ○ {n.name} — {presenceOf(n, live)!.label}
            </button>
          ))}
        </div>
      )}
      <IssueList issues={issues} onPick={onPick} />
      {!issues.length && <p className={s.muted}>Struktura kompletna.</p>}
    </>
  )
}

function LocationSelect({ n, graph, onLocation }: { n: GNode; graph: Graph; onLocation: (frameKey: string) => void }) {
  const current = frameOfNode(graph.frames, n)
  return (
    <div className={s.field}>
      <label htmlFor={`loc-${n.key}`}>Lokalizacja</label>
      <select id={`loc-${n.key}`} className={s.input} value={current?.key ?? NONE_FRAME} onChange={(e) => onLocation(e.target.value)}>
        {graph.frames.map((f) => <option key={f.key} value={f.key}>{f.key === NONE_FRAME ? '— brak —' : f.name}</option>)}
      </select>
    </div>
  )
}

export function TerminalPanel(props: {
  n: TerminalNode
  graph: Graph
  live: LiveStatus | null
  issues: Issue[]
  onRename: (v: string) => void
  onEditStart: () => void
  onRole: (r: Role) => void
  onDevice: (k: DeviceKind, v: string) => void
  onBrand: (brandKey: string, on: boolean) => void
  onLocation: (frameKey: string) => void
  onRemoveNew: () => void
}) {
  const { n, graph } = props
  const info = ROLE_INFO[n.role]
  const frame = frameOfNode(graph.frames, n)
  const brands = graph.nodes.filter((b): b is BrandNode => b.type === 'brand')
  const connected = new Set(graph.edges.filter((e) => e.to === n.key && e.kind === 'sale').map((e) => e.from))
  const visibleBrands = brands.filter((b) => connected.has(b.key) || !frame || frame.key === NONE_FRAME || frameOfNode(graph.frames, b)?.key === frame.key)
  const deviceOptions = (k: DeviceKind) => graph.nodes.filter((d) => d.key !== n.key && pinsOf(d).some((p) => p.dir === 'in' && p.kind === k))

  return (
    <>
      <h3>{n.hardware ? 'Stanowisko SBR' : 'Stanowisko'}</h3>
      <div className={s.field}>
        <label htmlFor="term-name">Nazwa</label>
        <input id="term-name" className={s.input} value={n.name} onFocus={props.onEditStart} onChange={(e) => props.onRename(e.target.value)} />
      </div>
      <PresenceLine n={n} live={props.live} />
      <div className={s.field}>
        <label htmlFor="term-role">Rola</label>
        <select id="term-role" className={s.input} value={n.role} onChange={(e) => props.onRole(e.target.value as Role)}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_INFO[r].name}</option>)}
        </select>
      </div>
      <LocationSelect n={n} graph={graph} onLocation={props.onLocation} />
      <div className={s.field}>
        <span className={s.fieldLabel}>Kod parowania</span>
        <span className={s.mono}>{n.code ?? 'zostanie nadany po zapisie'}{n.status === 'unclaimed' ? ' · niesparowane' : ''}</span>
      </div>

      {info.outputs.map((k) => {
        const edge = graph.edges.find((e) => e.from === n.key && e.kind === k)
        const value = edge ? edge.to : n.self[k] ? '__self' : n.raw[k] ? `__raw:${n.raw[k]}` : ''
        return (
          <div className={s.field} key={k}>
            <label htmlFor={`dev-${k}`}>{KIND_LABEL[k]}</label>
            <select id={`dev-${k}`} className={s.input} value={value} onChange={(e) => props.onDevice(k, e.target.value)}>
              <option value="">{n.hardware ? '— wbudowane (domyślnie) —' : k === 'fiscal' ? '— domyślne urządzenie firmy —' : '— brak —'}</option>
              {n.hardware && <option value="__self">wbudowane w to urządzenie</option>}
              {n.raw[k] && <option value={`__raw:${n.raw[k]}`}>{n.raw[k]} (nieznane)</option>}
              {deviceOptions(k).map((d) => (
                <option key={d.key} value={d.key}>
                  {d.name} · {d.type === 'device' ? d.deviceId : d.type === 'terminal' ? d.code ?? 'nowe' : ''}
                </option>
              ))}
            </select>
          </div>
        )
      })}

      {info.brandInput && (
        <div className={s.field}>
          <span className={s.fieldLabel}>
            {info.sells ? 'Sprzedawane marki' : 'Zamówienia marek'}{connected.size === 0 ? ' (brak zaznaczenia = wszystkie z lokalizacji)' : ''}
          </span>
          {visibleBrands.length === 0 && <span className={s.muted}>Brak marek w tej lokalizacji.</span>}
          {visibleBrands.map((b) => (
            <label key={b.key} className={s.check}>
              <input type="checkbox" id={`brand-${n.key}-${b.id}`} checked={connected.has(b.key)} onChange={(e) => props.onBrand(b.key, e.target.checked)} />
              {b.name}
            </label>
          ))}
        </div>
      )}

      <IssueList issues={props.issues} />
      {n.id ? (
        <Link className={s.link} href={`/dashboard/terminals/${n.id}`}>Szczegóły, kod QR i archiwizacja →</Link>
      ) : (
        <button className={s.tbtn} onClick={props.onRemoveNew}>Usuń nowe stanowisko</button>
      )}
    </>
  )
}

export function BrandPanel({ n, graph, issues, onLocation, onRemoveEdge }: {
  n: BrandNode; graph: Graph; issues: Issue[]; onLocation: (fk: string) => void; onRemoveEdge: (k: string) => void
}) {
  const edges = graph.edges.filter((e) => e.from === n.key)
  return (
    <>
      <h3>Marka</h3>
      <p className={s.brandName}>{n.name}</p>
      <LocationSelect n={n} graph={graph} onLocation={onLocation} />
      <div className={s.field}>
        <span className={s.fieldLabel}>Sprzedawana na ({edges.length})</span>
        {edges.length === 0 && <span className={s.muted}>Stanowiska bez przypisanych marek sprzedają wszystkie marki swojej lokalizacji.</span>}
        {edges.map((e) => (
          <div key={e.key} className={s.row}>
            <span>{graph.nodes.find((x) => x.key === e.to)?.name}</span>
            <button onClick={() => onRemoveEdge(e.key)}>usuń</button>
          </div>
        ))}
      </div>
      <IssueList issues={issues} />
      <Link className={s.link} href={`/dashboard/brands/${n.id}`}>Menu, wygląd i ustawienia marki →</Link>
    </>
  )
}

export function DevicePanel({ n, graph, live, issues, onRemoveEdge }: {
  n: DeviceNode; graph: Graph; live: LiveStatus | null; issues: Issue[]; onRemoveEdge: (k: string) => void
}) {
  const edges = graph.edges.filter((e) => e.to === n.key)
  return (
    <>
      <h3>{n.kind === 'hub' ? 'Hub fiskalny' : 'Urządzenie SBR'}</h3>
      <p className={s.brandName}>{n.name}</p>
      <p className={s.muted}>
        <span className={s.mono}>{n.deviceId}</span>{n.primary ? ' · domyślne urządzenie fiskalne firmy' : ''}
      </p>
      <PresenceLine n={n} live={live} />
      <div className={s.field}>
        <span className={s.fieldLabel}>Używane przez ({edges.length})</span>
        {edges.map((e) => (
          <div key={e.key} className={`${s.row} ${KIND_CLASS[e.kind]}`}>
            <span className={s.rowText}>{graph.nodes.find((x) => x.key === e.from)?.name} · {KIND_LABEL[e.kind].toLowerCase()}</span>
            <button onClick={() => onRemoveEdge(e.key)}>usuń</button>
          </div>
        ))}
      </div>
      <IssueList issues={issues} />
      <Link className={s.link} href="/dashboard/fiscal-devices">Zarządzaj urządzeniami fiskalnymi →</Link>
    </>
  )
}
