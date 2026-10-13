import { selectAll } from './supabase'

// CSV files that open cleanly in Excel and Google Sheets

function cell(value) {
  if (value === null || value === undefined) return ''
  let text = String(value)
  // Text starting with = + - @ would be treated as a formula by Excel; numbers like -5 are fine
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text) && isNaN(Number(text))) text = "'" + text
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

// All rows of a query (past the 1000-row limit), throwing on error
export async function fetchAll(makeQuery) {
  const { data, error } = await selectAll(makeQuery)
  if (error) throw error
  return data
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
