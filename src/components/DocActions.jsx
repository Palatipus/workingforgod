import { useState } from 'react'
import { shareNotice } from '../invoice'
import { errorText } from '../errors'

// "Download" and "Share" buttons for a document that is loaded on demand (receipt, refund note, ...)
export default function DocActions({ load, download, share, label = '', className = '' }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function run(sharing) {
    setBusy(true)
    setNote('')
    try {
      const data = await load()
      if (sharing) setNote(shareNotice(await share(data)))
      else await download(data)
    } catch (err) {
      setNote(errorText(err))
    }
    setBusy(false)
  }

  return (
    <span className={className}>
      <span className="inline-flex gap-3">
        <button type="button" disabled={busy} onClick={() => run(false)}
          className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50">Download{label && ' ' + label}</button>
        <button type="button" disabled={busy} onClick={() => run(true)}
          className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50">Share{label && ' ' + label}</button>
      </span>
      {note && <span className="mt-1 block text-xs text-slate-500">{note}</span>}
    </span>
  )
}
