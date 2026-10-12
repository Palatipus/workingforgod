import { today } from '../format'

function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function addDays(dateText, n) {
  const d = new Date(dateText + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return ymd(d)
}

// Turns a choice into dates: from (inclusive) and to (inclusive), as YYYY-MM-DD, or null for no limit
export function rangeDates(range) {
  const now = new Date()
  if (range.preset === 'today') return { from: today(), to: today() }
  if (range.preset === 'week') {
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    return { from: ymd(monday), to: today() }
  }
  if (range.preset === 'month') return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: today() }
  if (range.preset === 'lastMonth') {
    return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) }
  }
  if (range.preset === 'custom') return { from: range.from || null, to: range.to || null }
  return { from: null, to: null }
}

// Adds created_at limits to a Supabase query
export function applyRange(query, range, column = 'created_at') {
  const { from, to } = rangeDates(range)
  if (from) query = query.gte(column, from + 'T00:00:00')
  if (to) query = query.lt(column, addDays(to, 1) + 'T00:00:00')
  return query
}

export function rangeLabel(range) {
  const { from, to } = rangeDates(range)
  if (!from && !to) return 'all-time'
  return (from || 'start') + '_to_' + (to || today())
}

const presets = [
  ['all', 'All time'],
  ['today', 'Today'],
  ['week', 'This week'],
  ['month', 'This month'],
  ['lastMonth', 'Last month'],
  ['custom', 'Pick dates'],
]

export default function DateRange({ value, onChange, allowAll = true }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className="input !w-auto" value={value.preset} onChange={(e) => onChange({ ...value, preset: e.target.value })}>
        {presets.filter(([key]) => allowAll || key !== 'all').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      {value.preset === 'custom' && (
        <>
          <input className="input !w-auto" type="date" value={value.from || ''} max={value.to || today()}
            onChange={(e) => onChange({ ...value, from: e.target.value })} aria-label="From" />
          <span className="text-sm text-slate-400">to</span>
          <input className="input !w-auto" type="date" value={value.to || ''} min={value.from || undefined} max={today()}
            onChange={(e) => onChange({ ...value, to: e.target.value })} aria-label="To" />
        </>
      )}
    </div>
  )
}
