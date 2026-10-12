// CSV files that open cleanly in Excel and Google Sheets

function cell(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

export function toCsv(headers, rows) {
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
}

export function downloadCsv(name, csv) {
  // The BOM makes Excel read the file as UTF-8 (so names with accents and "GH₵" show correctly)
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name + '.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Supabase returns at most 1000 rows per request, so fetch in pages until everything is in
export async function fetchAll(makeQuery) {
  const size = 1000
  const all = []
  for (let from = 0; ; from += size) {
    const { data, error } = await makeQuery().range(from, from + size - 1)
    if (error) throw error
    all.push(...data)
    if (data.length < size) return all
  }
}

export function dateTime(value) {
  if (!value) return ''
  const d = new Date(value)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
    ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

export function num(n) {
  return n === null || n === undefined ? '' : Number(n).toFixed(2)
}
