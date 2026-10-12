import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import Modal from '../components/Modal'
import LoadError from '../components/LoadError'
import { stockStatus, adjustReasons, movementLabels } from '../format'
import { invoiceNumber } from '../invoice'
import { shrinkImage } from '../image'

const filters = [
  ['all', 'All'],
  ['equipment', 'Equipment'],
  ['reagent', 'Reagents'],
  ['consumable', 'Consumables'],
  ['low', 'Low stock'],
]

function ProductForm({ product, onClose, onSaved }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({
    name: product?.name || '',
    category: product?.category || 'equipment',
    brand: product?.brand || '',
    description: product?.description || '',
    reorder_level: product?.reorder_level ?? 5,
    initial_stock: 0,
  })
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(false)

  const [preview, setPreview] = useState(product?.image_url || null)

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function update(field, value) {
    setForm({ ...form, [field]: value })
  }

  async function uploadImage() {
    const small = await shrinkImage(file)
    const ext = small.name.split('.').pop()
    const path = crypto.randomUUID() + '.' + ext
    const { error } = await supabase.storage.from('product-images').upload(path, small, { contentType: small.type })
    if (error) throw error
    return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      let image_url = product?.image_url || null
      if (file) image_url = await uploadImage()

      const fields = {
        name: form.name,
        category: form.category,
        brand: form.brand || null,
        description: form.description || null,
        reorder_level: Number(form.reorder_level),
        image_url,
      }

      if (product) {
        const { error } = await supabase.from('products').update(fields).eq('id', product.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('products').insert(fields).select().single()
        if (error) throw error
        if (Number(form.initial_stock) > 0) {
          const { error: stockError } = await supabase.from('stock_in').insert({
            product_id: data.id,
            qty: Number(form.initial_stock),
            supplier: 'Opening stock',
            created_by: profile.id,
          })
          if (stockError) throw stockError
        }
      }
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  // Products are hidden rather than deleted so past orders and invoices keep their item names.
  async function remove() {
    setSaving(true)
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', product.id)
    if (error) {
      setError(error.message)
      setSaving(false)
      setConfirmRemove(false)
      return
    }
    onSaved()
  }

  if (confirmRemove) {
    return (
      <Modal title="Remove product?" onClose={() => setConfirmRemove(false)}>
        <p className="text-sm text-slate-600">
          {product.name} will be removed from inventory and new orders. Past orders and invoices are not affected.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setConfirmRemove(false)} className="btn-ghost">Cancel</button>
          <button disabled={saving} onClick={remove}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Removing...' : 'Yes, remove'}
          </button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={product ? 'Edit product' : 'Add product'} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <label className="flex h-44 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white">
          {preview
            ? <img src={preview} className="h-full w-full object-contain p-3" />
            : <span className="text-sm text-slate-400">Click to upload a white-background photo</span>}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files[0])} />
        </label>

        <input className="input" placeholder="Product name" value={form.name}
          onChange={(e) => update('name', e.target.value)} required />

        <div className="grid grid-cols-2 gap-3">
          <select className="input" value={form.category} onChange={(e) => update('category', e.target.value)}>
            <option value="equipment">Equipment</option>
            <option value="reagent">Reagent</option>
            <option value="consumable">Consumable</option>
          </select>
          <input className="input" placeholder="Brand (e.g. Mindray)" value={form.brand}
            onChange={(e) => update('brand', e.target.value)} />
        </div>

        <textarea className="input" rows="2" placeholder="Description" value={form.description}
          onChange={(e) => update('description', e.target.value)} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500">Reorder level</label>
            <input className="input" type="number" min="0" value={form.reorder_level}
              onChange={(e) => update('reorder_level', e.target.value)} />
          </div>
          {!product && (
            <div>
              <label className="text-xs text-slate-500">Opening stock</label>
              <input className="input" type="number" min="0" value={form.initial_stock}
                onChange={(e) => update('initial_stock', e.target.value)} />
            </div>
          )}
        </div>

        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <div className="flex justify-end gap-3">
          {product && profile.role === 'admin' && (
            <button type="button" onClick={() => setConfirmRemove(true)}
              className="mr-auto text-sm font-medium text-red-600 hover:underline">
              Remove product
            </button>
          )}
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={saving} className="btn">{saving ? 'Saving...' : 'Save product'}</button>
        </div>
      </form>
    </Modal>
  )
}

function StockForm({ product, onClose, onSaved }) {
  const { profile } = useAuth()
  const [qty, setQty] = useState('')
  const [supplier, setSupplier] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('stock_in').insert({
      product_id: product.id,
      qty: Number(qty),
      supplier: supplier || null,
      created_by: profile.id,
    })
    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }
    onSaved()
  }

  return (
    <Modal title={'Add stock: ' + product.name} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="text-sm text-slate-500">Currently {product.stock_qty} in stock.</div>
        <input className="input" type="number" min="1" placeholder="Quantity received" value={qty}
          onChange={(e) => setQty(e.target.value)} required />
        <input className="input" placeholder="Supplier (optional)" value={supplier}
          onChange={(e) => setSupplier(e.target.value)} />
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={saving} className="btn">Add stock</button>
        </div>
      </form>
    </Modal>
  )
}

function AdjustForm({ product, onClose, onSaved }) {
  const [direction, setDirection] = useState('remove')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('damaged')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const n = Number(qty)
  const valid = Number.isInteger(n) && n >= 1 && (direction === 'add' || n <= product.stock_qty)

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.rpc('adjust_stock', {
      p_product_id: product.id,
      p_change: direction === 'add' ? n : -n,
      p_reason: reason,
      p_note: note || null,
    })
    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }
    onSaved()
  }

  return (
    <Modal title={'Adjust stock: ' + product.name} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <p className="text-sm text-slate-500">
          For corrections and write-offs. Currently {product.stock_qty} in stock. New stock from a supplier goes through "+ Stock" instead.
        </p>
        <div className="flex gap-2 rounded-lg bg-slate-100 p-1">
          {[['remove', 'Remove'], ['add', 'Add']].map(([key, label]) => (
            <button type="button" key={key} onClick={() => setDirection(key)}
              className={'flex-1 rounded-md py-1.5 text-sm font-medium ' +
                (direction === key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500')}>
              {label}
            </button>
          ))}
        </div>
        <input className={'input ' + (qty === '' || valid ? '' : '!border-red-400')} type="number" min="1" step="1"
          max={direction === 'remove' ? product.stock_qty : undefined}
          placeholder="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} required />
        {qty !== '' && !valid && (
          <div className="-mt-2 text-xs text-red-600">
            {direction === 'remove' ? 'Enter a whole number from 1 to ' + product.stock_qty + '.' : 'Enter a whole number of at least 1.'}
          </div>
        )}
        <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
          {adjustReasons.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <input className="input" placeholder="Details (optional), e.g. batch number" value={note}
          onChange={(e) => setNote(e.target.value)} />
        {valid && (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            Stock will go from {product.stock_qty} to <b>{product.stock_qty + (direction === 'add' ? n : -n)}</b>.
          </div>
        )}
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button disabled={saving || !valid} className="btn">{saving ? 'Saving...' : 'Save adjustment'}</button>
        </div>
      </form>
    </Modal>
  )
}

function History({ product, isAdmin, onAdjust, onClose }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [failed, setFailed] = useState(false)

  async function load() {
    setFailed(false)
    const { data, error } = await supabase.from('stock_movements')
      .select('id, change, balance_after, kind, note, created_at, order_id, orders(order_number), profiles(full_name)')
      .eq('product_id', product.id)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) setFailed(true)
    else setRows(data || [])
  }

  useEffect(() => { load() }, [product.id, product.stock_qty])

  return (
    <Modal title={'Stock history: ' + product.name} onClose={onClose} wide>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">Now <b className="text-slate-900">{product.stock_qty}</b> in stock</div>
        {isAdmin && <button onClick={onAdjust} className="btn-ghost !py-1.5">Adjust stock</button>}
      </div>

      {failed && <div className="mt-4"><LoadError compact onRetry={load} /></div>}
      {!rows && !failed && <div className="py-10 text-center text-sm text-slate-400">Loading...</div>}

      {rows && (
        <div className="mt-4 overflow-x-auto"><table className="w-full whitespace-nowrap text-sm">
          <thead className="text-left text-xs uppercase text-slate-400">
            <tr><th className="py-2">Date</th><th className="py-2">What</th><th className="py-2 text-right">Change</th><th className="py-2 text-right">Stock after</th><th className="py-2">By</th></tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-slate-100 align-top">
                <td className="py-2.5 pr-3 text-slate-500">{new Date(m.created_at).toLocaleDateString()}</td>
                <td className="py-2.5 pr-3">
                  <div className="font-medium">{movementLabels[m.kind] || m.kind}</div>
                  {m.orders && (
                    <button onClick={() => navigate('/orders?order=' + m.order_id)} className="text-xs text-indigo-600 hover:underline">
                      {invoiceNumber(m.orders.order_number)}
                    </button>
                  )}
                  {m.note && <div className="whitespace-normal text-xs text-slate-500">{m.note}</div>}
                </td>
                <td className={'py-2.5 pr-3 text-right font-semibold ' + (m.change > 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {m.change > 0 ? '+' + m.change : m.change}
                </td>
                <td className="py-2.5 pr-3 text-right">{m.balance_after}</td>
                <td className="py-2.5 text-slate-500">{m.profiles?.full_name || '-'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan="5" className="py-10 text-center text-slate-400">No stock changes yet</td></tr>
            )}
          </tbody>
        </table></div>
      )}
    </Modal>
  )
}

export default function Inventory() {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [stocking, setStocking] = useState(null)
  const [adjusting, setAdjusting] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [params, setParams] = useSearchParams()
  const { profile } = useAuth()
  const isAdmin = profile.role === 'admin'

  async function load() {
    const { data, error } = await supabase.from('products').select('*').eq('is_active', true).order('name')
    if (error) {
      setLoadFailed(true)
      return
    }
    setLoadFailed(false)
    setProducts(data || [])
  }

  useEffect(() => {
    load()
    const channel = supabase
      .channel('products-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, load)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // ?product=<id> opens that product's history (used by low-stock alerts)
  const historyId = params.get('product')
  const historyProduct = products.find((p) => p.id === historyId)
  function showHistory(id) {
    setParams(id ? { product: id } : {})
  }

  const shown = products.filter((p) => {
    const text = (p.name + ' ' + (p.brand || '')).toLowerCase()
    if (!text.includes(search.toLowerCase())) return false
    if (filter === 'low') return p.stock_qty <= p.reorder_level
    if (filter !== 'all') return p.category === filter
    return true
  })

  function saved() {
    setEditing(null)
    setStocking(null)
    setAdjusting(null)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Inventory</h1>
          <p className="text-sm text-slate-500">{products.length} products</p>
        </div>
        <button onClick={() => setEditing('new')} className="btn">+ Add product</button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filters.map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={'shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium ' +
                (filter === key ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50')}>
              {label}
            </button>
          ))}
        </div>
        <input className="input md:max-w-xs" placeholder="Search products" value={search}
          onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
        {shown.map((p) => {
          const status = stockStatus(p)
          return (
            <div key={p.id} className="overflow-hidden card transition hover:shadow-md">
              <div className="flex h-36 items-center justify-center bg-white p-4 md:h-48">
                {p.image_url
                  ? <img src={p.image_url} alt={p.name} className="h-full w-full object-contain" />
                  : <span className="text-4xl text-slate-200">▢</span>}
              </div>
              <div className="border-t border-slate-100 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold leading-snug">{p.name}</div>
                  <span className={'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ' + status.cls}>{status.label}</span>
                </div>
                <div className="mt-1 text-xs capitalize text-slate-400">
                  {p.brand ? p.brand + ' · ' : ''}{p.category}
                </div>
                <button onClick={() => showHistory(p.id)} className="mt-3 block text-left">
                  <span className="text-2xl font-bold">{p.stock_qty}</span>
                  <span className="ml-1 text-xs font-normal text-slate-400">in stock</span>
                  <span className="block text-xs font-medium text-indigo-600 hover:underline">Stock history</span>
                </button>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setStocking(p)} className="btn flex-1 !py-1.5">+ Stock</button>
                  <button onClick={() => setEditing(p)} className="btn-ghost !py-1.5">Edit</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {loadFailed && <LoadError onRetry={load} />}

      {!loadFailed && shown.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-400">
          No products found
        </div>
      )}

      {editing && (
        <ProductForm product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={saved} />
      )}
      {stocking && <StockForm product={stocking} onClose={() => setStocking(null)} onSaved={saved} />}
      {historyProduct && (
        <History product={historyProduct} isAdmin={isAdmin} onClose={() => showHistory(null)}
          onAdjust={() => setAdjusting(historyProduct)} />
      )}
      {adjusting && <AdjustForm product={adjusting} onClose={() => setAdjusting(null)} onSaved={saved} />}
    </div>
  )
}
