import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import LoadError from '../components/LoadError'
import { company, applyCompany } from '../company'
import { downloadInvoice } from '../invoice'
import { errorText } from '../errors'

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  )
}

function toForm(data) {
  return {
    name: data.name || '',
    tagline: data.tagline || '',
    phone: data.phone || '',
    whatsapp: data.whatsapp || '',
    email: data.email || '',
    address: (data.address || []).join('\n'),
    bankName: data.bank?.name || '',
    account: data.bank?.account || '',
    merchantNo: data.bank?.merchantNo || '',
    accountName: data.bank?.accountName || '',
    terms: [...(data.terms || [])],
    defaultDueDays: data.defaultDueDays ? String(data.defaultDueDays) : '',
  }
}

function fromForm(f) {
  return {
    name: f.name.trim(),
    tagline: f.tagline.trim(),
    phone: f.phone.trim(),
    whatsapp: f.whatsapp.trim(),
    email: f.email.trim(),
    address: f.address.split('\n').map((l) => l.trim()).filter(Boolean),
    bank: { name: f.bankName.trim(), account: f.account.trim(), merchantNo: f.merchantNo.trim(), accountName: f.accountName.trim() },
    terms: f.terms.map((t) => t.trim()).filter(Boolean),
    defaultDueDays: Number(f.defaultDueDays) > 0 ? Math.round(Number(f.defaultDueDays)) : null,
  }
}

// A made-up invoice so the layout can be checked before customers see it
function sampleInvoice() {
  return {
    invoiceNumber: 'SAMPLE',
    date: new Date().toISOString(),
    dueDate: null,
    customer: { name: 'Sample Customer Laboratory', phone: '0240000000', location: 'Kumasi' },
    salesperson: 'Sample',
    paid: 100,
    previousBalance: 0,
    notes: '',
    items: [
      { name: 'Sample reagent kit', qty: 2, price: 150, pending_qty: 0 },
      { name: 'Sample consumable', qty: 10, price: 5, pending_qty: 0 },
    ],
  }
}

export default function Settings() {
  const [form, setForm] = useState(null)
  const [meta, setMeta] = useState(null)
  const [failed, setFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  async function load() {
    setFailed(false)
    const { data, error } = await supabase.from('company_settings')
      .select('data, updated_at, profiles(full_name)').eq('id', 1).maybeSingle()
    if (error) {
      setFailed(true)
      return
    }
    setForm(toForm(data?.data || company))
    setMeta(data)
  }

  useEffect(() => { load() }, [])

  function update(field, value) {
    setForm({ ...form, [field]: value })
    setMessage(null)
  }

  function updateTerm(i, value) {
    const terms = [...form.terms]
    terms[i] = value
    update('terms', terms)
  }

  async function save(e) {
    e.preventDefault()
    const data = fromForm(form)
    if (!data.name) return setMessage({ ok: false, text: 'The business name cannot be empty.' })
    setSaving(true)
    const { data: saved, error } = await supabase.from('company_settings').update({ data }).eq('id', 1).select('id')
    setSaving(false)
    if (error) return setMessage({ ok: false, text: errorText(error) })
    if (!saved || saved.length === 0) {
      return setMessage({ ok: false, text: 'Nothing was saved. Only admins can change these details. Make sure schema_update_11.sql has been run.' })
    }
    applyCompany(data)
    setMessage({ ok: true, text: 'Saved. New invoices, receipts and statements will use these details.' })
    load()
  }

  // Show the unsaved details on a sample, then put the saved ones back so real invoices aren't affected
  async function preview() {
    const saved = JSON.parse(JSON.stringify(company))
    applyCompany(fromForm(form))
    try {
      await downloadInvoice(sampleInvoice())
    } finally {
      applyCompany(saved)
    }
  }

  if (failed) return <LoadError onRetry={load} />
  if (!form) return <div className="text-slate-500">Loading...</div>

  return (
    <form onSubmit={save} className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">
          Business details printed on invoices, receipts, refund notes and statements.
          {meta?.updated_at && meta?.profiles?.full_name && (
            <> Last changed {new Date(meta.updated_at).toLocaleString()} by {meta.profiles.full_name}.</>
          )}
        </p>
      </div>

      <div className="card space-y-4 p-5">
        <div className="text-sm font-semibold">Business</div>
        <Field label="Business name"><input className="input" value={form.name} onChange={(e) => update('name', e.target.value)} /></Field>
        <Field label="Tagline" hint="The short line under the name at the top of documents.">
          <input className="input" value={form.tagline} onChange={(e) => update('tagline', e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Phone"><input className="input" value={form.phone} onChange={(e) => update('phone', e.target.value)} /></Field>
          <Field label="WhatsApp (for proof of payment)"><input className="input" value={form.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} /></Field>
          <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} /></Field>
        </div>
        <Field label="Address" hint="One line per row, as it should appear on the invoice.">
          <textarea className="input" rows="3" value={form.address} onChange={(e) => update('address', e.target.value)} />
        </Field>
      </div>

      <div className="card space-y-4 p-5">
        <div className="text-sm font-semibold">Payment details</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Bank"><input className="input" value={form.bankName} onChange={(e) => update('bankName', e.target.value)} /></Field>
          <Field label="Account name"><input className="input" value={form.accountName} onChange={(e) => update('accountName', e.target.value)} /></Field>
          <Field label="Account number"><input className="input" value={form.account} onChange={(e) => update('account', e.target.value)} /></Field>
          <Field label="Merchant number"><input className="input" value={form.merchantNo} onChange={(e) => update('merchantNo', e.target.value)} /></Field>
        </div>
        <p className="text-xs text-amber-700">Double-check these. Customers send money to whatever is printed here.</p>
      </div>

      <div className="card space-y-4 p-5">
        <div className="text-sm font-semibold">Credit</div>
        <Field label="Default days to pay a balance"
          hint="When an order isn't fully paid, the due date starts this many days ahead (staff can change it). Leave empty for no default.">
          <input className="input !w-32" type="number" min="1" step="1" placeholder="e.g. 30" value={form.defaultDueDays}
            onChange={(e) => update('defaultDueDays', e.target.value)} />
        </Field>
      </div>

      <div className="card space-y-3 p-5">
        <div className="text-sm font-semibold">Terms and conditions</div>
        {form.terms.map((term, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="mt-2.5 w-5 shrink-0 text-right text-sm text-slate-400">{i + 1}.</span>
            <textarea className="input" rows="2" value={term} onChange={(e) => updateTerm(i, e.target.value)} />
            <button type="button" onClick={() => update('terms', form.terms.filter((_, j) => j !== i))}
              aria-label="Remove term" className="mt-2 text-slate-300 hover:text-red-500">✕</button>
          </div>
        ))}
        <button type="button" onClick={() => update('terms', [...form.terms, ''])} className="text-sm font-medium text-indigo-600 hover:underline">
          + Add a term
        </button>
      </div>

      {message && (
        <div className={'rounded-xl px-4 py-3 text-sm ' + (message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-600')}>{message.text}</div>
      )}

      <div className="flex flex-wrap gap-3">
        <button disabled={saving} className="btn">{saving ? 'Saving...' : 'Save changes'}</button>
        <button type="button" onClick={preview} className="btn-ghost">
          Preview a sample invoice
        </button>
      </div>
      <p className="text-xs text-slate-400">The preview uses what is on this page, even before you save.</p>
    </form>
  )
}
