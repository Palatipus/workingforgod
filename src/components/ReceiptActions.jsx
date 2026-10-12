import { useState } from 'react'
import { fetchReceipt } from '../receipts'
import { downloadReceipt, shareReceipt, shareNotice } from '../invoice'

// "Download receipt" and "Share receipt" buttons for one receipt
export default function ReceiptActions({ receiptId, label = 'receipt', className = '' }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function run(share) {
    setBusy(true)
    setNote('')
    try {
      const data = await fetchReceipt(receiptId)
      if (share) setNote(shareNotice(await shareReceipt(data)))
      else await downloadReceipt(data)
    } catch {
      setNote('Could not load the receipt. Check your connection and try again.')
    }
    setBusy(false)
  }

  return (
    <span className={className}>
      <span className="inline-flex gap-3">
        <button type="button" disabled={busy} onClick={() => run(false)}
          className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50">Download {label}</button>
        <button type="button" disabled={busy} onClick={() => run(true)}
          className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50">Share {label}</button>
      </span>
      {note && <span className="mt-1 block text-xs text-slate-500">{note}</span>}
    </span>
  )
}
