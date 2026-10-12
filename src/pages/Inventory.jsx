import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../AuthContext'
import Modal from '../components/Modal'
import { stockStatus } from '../format'
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

export default function Inventory() {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [stocking, setStocking] = useState(null)

  async function load() {
    const { data } = await supabase.from('products').select('*').eq('is_active', true).order('name')
    setProducts(data || [])
  }

  useEffect(() => { load() }, [])

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
                <div className="mt-3 text-2xl font-bold">{p.stock_qty}<span className="ml-1 text-xs font-normal text-slate-400">in stock</span></div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setStocking(p)} className="btn flex-1 !py-1.5">+ Stock</button>
                  <button onClick={() => setEditing(p)} className="btn-ghost !py-1.5">Edit</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {shown.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-400">
          No products found
        </div>
      )}

      {editing && (
        <ProductForm product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={saved} />
      )}
      {stocking && <StockForm product={stocking} onClose={() => setStocking(null)} onSaved={saved} />}
    </div>
  )
}
