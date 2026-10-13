import { company, loadCompany } from './company'

// The PDF libraries are big, so they load only when a PDF is first needed.
let libPromise
export function loadPdf() {
  if (!libPromise) {
    libPromise = Promise.all([import('jspdf'), import('jspdf-autotable'), import('./logoData'), loadCompany()])
      .then(([pdf, table, logo]) => ({
        jsPDF: pdf.jsPDF || pdf.default?.jsPDF || pdf.default,
        autoTable: table.autoTable || table.default,
        logoData: logo.logoData,
      }))
      .catch((err) => {
        libPromise = null   // let the next attempt try again instead of failing forever
        throw err
      })
  }
  return libPromise
}

const NAVY = [11, 42, 74]
const BLUE = [31, 116, 176]
const GREEN = [163, 214, 92]
const RED = [224, 51, 76]
const TEXT = [15, 23, 42]
const MUTED = [100, 116, 139]
const SOFT = [244, 247, 250]
const LINE = [226, 232, 240]
const AMBER = [180, 83, 9]
const OK = [22, 163, 74]

export function invoiceNumber(n) {
  return 'INV' + String(n).padStart(4, '0')
}

function fmt(n) {
  return 'GHS ' + Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function shortDate(value) {
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function invoiceTotals(data) {
  let subtotal = 0
  for (const item of data.items) subtotal += item.qty * item.price
  const paid = Number(data.paid || 0)
  const balance = Math.max(0, subtotal - paid)
  const previous = Number(data.previousBalance || 0)
  const status = balance <= 0.005 ? 'PAID' : paid > 0 ? 'PART PAID' : 'UNPAID'
  return { subtotal, paid, balance, previous, totalDue: balance + previous, status }
}

export function invoiceMessage(data) {
  const t = invoiceTotals(data)
  const lines = [
    'Invoice ' + data.invoiceNumber + ' - ' + company.name,
    'Customer: ' + data.customer.name,
    'Date: ' + shortDate(data.date),
    'This invoice: ' + fmt(t.subtotal),
    'Paid: ' + fmt(t.paid),
  ]
  if (t.previous > 0) lines.push('Previous balance: ' + fmt(t.previous))
  lines.push('TOTAL DUE: ' + fmt(t.totalDue), '')
  if (t.totalDue > 0.005) {
    lines.push(
      'Pay to ' + company.bank.name + ', account ' + company.bank.account +
        ', merchant no ' + company.bank.merchantNo + ' (' + company.bank.accountName + ').',
      'Send proof of payment to WhatsApp ' + company.whatsapp + '.'
    )
  } else {
    lines.push('Thank you, this invoice is fully paid.')
  }
  return lines.join('\n')
}

const W = 210
const M = 14

function drawHeader(doc, logoData, title, rightLines) {
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, W, 42, 'F')
  doc.setFillColor(...GREEN)
  doc.rect(0, 42, 70, 1.6, 'F')
  doc.setFillColor(...RED)
  doc.rect(70, 42, 28, 1.6, 'F')
  doc.setFillColor(...BLUE)
  doc.rect(98, 42, W - 98, 1.6, 'F')

  doc.addImage(logoData, 'PNG', M, 9, 24, 24)
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(company.name, M + 29, 20)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(180, 208, 235)
  doc.text(company.tagline, M + 29, 26.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(255, 255, 255)
  doc.text(title, W - M, 19, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(200, 222, 242)
  rightLines.forEach((line, i) => doc.text(line, W - M, 26 + i * 5, { align: 'right' }))
}

function drawFooter(doc) {
  const pages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(...LINE)
    doc.line(M, 285, W - M, 285)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text('Thank you for your business.   ' + company.name + '   |   ' + company.phone, M, 290)
    doc.text('Page ' + i + ' of ' + pages, W - M, 290, { align: 'right' })
  }
}

// Bank details box, 92mm wide and 40mm tall, at (M, y)
function drawBankBox(doc, y) {
  doc.setFillColor(...SOFT)
  doc.setDrawColor(...LINE)
  doc.roundedRect(M, y, 92, 40, 3, 3, 'FD')
  doc.setFillColor(...GREEN)
  doc.roundedRect(M, y, 1.6, 40, 0.8, 0.8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...BLUE)
  doc.text('PAYMENT DETAILS', M + 6, y + 7)
  doc.setFontSize(10)
  doc.setTextColor(...TEXT)
  doc.text(company.bank.name, M + 6, y + 14)
  const bankRows = [
    ['Account no.', company.bank.account],
    ['Merchant no.', company.bank.merchantNo],
    ['Account name', company.bank.accountName],
  ]
  let by = y + 20.5
  for (const [label, value] of bankRows) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...MUTED)
    doc.text(label, M + 6, by)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...TEXT)
    doc.text(value, M + 33, by)
    by += 5
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text('Send proof of payment to WhatsApp ' + company.whatsapp, M + 6, y + 36.5)
}

export function buildInvoice(data, { jsPDF, autoTable, logoData }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const t = invoiceTotals(data)
  const statusColor = t.status === 'PAID' ? OK : t.status === 'PART PAID' ? [217, 119, 6] : RED

  drawHeader(doc, logoData, 'INVOICE', [
    'No. ' + data.invoiceNumber,
    'Date: ' + shortDate(data.date),
    'Due: ' + (data.dueDate ? shortDate(data.dueDate) : 'On receipt'),
  ])

  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  doc.text('Sales representative: ' + (data.salesperson || '-'), M, 54)
  doc.setFillColor(...statusColor)
  doc.roundedRect(W - M - 32, 49, 32, 7.5, 3.75, 3.75, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text(t.status, W - M - 16, 54, { align: 'center' })

  const cardY = 61
  const cardH = 38
  const cardW = (W - 2 * M - 6) / 2

  function card(x, label) {
    doc.setFillColor(...SOFT)
    doc.setDrawColor(...LINE)
    doc.roundedRect(x, cardY, cardW, cardH, 3, 3, 'FD')
    doc.setFillColor(...BLUE)
    doc.roundedRect(x, cardY, 1.6, cardH, 0.8, 0.8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...BLUE)
    doc.text(label, x + 6, cardY + 7)
  }

  card(M, 'BILLED TO')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(...TEXT)
  const nameLines = doc.splitTextToSize(data.customer.name, cardW - 12).slice(0, 2)
  doc.text(nameLines, M + 6, cardY + 14)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  let cy = cardY + 14 + nameLines.length * 5.5
  if (data.customer.phone) {
    doc.text(data.customer.phone, M + 6, cy)
    cy += 5
  }
  if (data.customer.location) {
    doc.text(doc.splitTextToSize(data.customer.location, cardW - 12).slice(0, 2), M + 6, cy)
  }

  const fx = M + cardW + 6
  card(fx, 'FROM')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...TEXT)
  doc.text(company.name, fx + 6, cardY + 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  let fy = cardY + 18
  for (const line of [company.phone, company.email, ...company.address]) {
    doc.text(line, fx + 6, fy)
    fy += 4.2
  }

  const rows = data.items.map((item, i) => [
    i + 1,
    item.pending_qty > 0 ? item.name + '\nPending delivery: ' + item.pending_qty + ' to follow' : item.name,
    item.qty,
    fmt(item.price),
    fmt(item.qty * item.price),
  ])

  autoTable(doc, {
    startY: cardY + cardH + 9,
    head: [['#', 'Description', 'Qty', 'Unit price', 'Amount']],
    body: rows,
    margin: { left: M, right: M },
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: { top: 3.2, bottom: 3.2, left: 3, right: 3 }, textColor: TEXT, lineColor: LINE, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, lineWidth: 0 },
    alternateRowStyles: { fillColor: [250, 252, 254] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 36, halign: 'right' },
      4: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (hook) => {
      if (hook.section === 'head') hook.cell.styles.halign = [0, 2].includes(hook.column.index) ? 'center' : hook.column.index >= 3 ? 'right' : 'left'
      if (hook.section === 'body' && hook.column.index === 1 && String(hook.cell.raw).includes('Pending delivery')) {
        hook.cell.styles.textColor = RED
      }
    },
  })

  let y = doc.lastAutoTable.finalY + 8
  if (data.notes) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.setTextColor(...MUTED)
    const noteLines = doc.splitTextToSize('Note: ' + data.notes, W - 2 * M).slice(0, 4)
    doc.text(noteLines, M, y)
    y += noteLines.length * 4 + 4
  }
  if (y > 200) {
    doc.addPage()
    y = 20
  }

  drawBankBox(doc, y)

  const tw = 84
  const tx = W - M - tw
  let ty = y

  function totalRow(label, value, color, bold) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...(color || TEXT))
    doc.text(label, tx, ty + 5)
    doc.text(value, tx + tw, ty + 5, { align: 'right' })
    ty += 8
    doc.setDrawColor(...LINE)
    doc.line(tx, ty - 1.5, tx + tw, ty - 1.5)
  }

  totalRow('This invoice', fmt(t.subtotal))
  totalRow('Amount paid', '- ' + fmt(t.paid), OK)
  totalRow('Balance on this invoice', fmt(t.balance), t.balance > 0.005 ? RED : TEXT, true)
  if (t.previous > 0) totalRow('Previous balance', fmt(t.previous), AMBER, true)

  ty += 2
  const settled = t.totalDue <= 0.005
  doc.setFillColor(...(settled ? OK : NAVY))
  doc.roundedRect(tx, ty, tw, 14, 3, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text(settled ? 'PAID IN FULL' : 'TOTAL AMOUNT DUE', tx + 5, ty + 8.6)
  doc.setFontSize(12)
  doc.text(fmt(t.totalDue), tx + tw - 5, ty + 9, { align: 'right' })
  ty += 14

  if (t.previous > 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.setTextColor(...AMBER)
    doc.text('Includes ' + fmt(t.previous) + ' from earlier unpaid invoices.', tx + tw, ty + 5, { align: 'right' })
    ty += 6
  }

  y = Math.max(y + 40, ty) + 10

  doc.setFontSize(7.5)
  const termLines = []
  company.terms.forEach((term, i) => {
    const wrapped = doc.splitTextToSize((i + 1) + '. ' + term, W - 2 * M - 12)
    termLines.push(...wrapped)
  })
  const termsH = 13 + termLines.length * 3.4
  if (y + termsH > 278) {
    doc.addPage()
    y = 20
  }
  doc.setFillColor(...SOFT)
  doc.setDrawColor(...LINE)
  doc.roundedRect(M, y, W - 2 * M, termsH, 3, 3, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...BLUE)
  doc.text('TERMS & CONDITIONS', M + 6, y + 7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  termLines.forEach((line, i) => doc.text(line, M + 6, y + 12.5 + i * 3.4))

  drawFooter(doc)

  return doc
}

export async function downloadInvoice(data) {
  buildInvoice(data, await loadPdf()).save(data.invoiceNumber + '.pdf')
}

export async function invoiceFile(data) {
  const blob = buildInvoice(data, await loadPdf()).output('blob')
  return new File([blob], data.invoiceNumber + '.pdf', { type: 'application/pdf' })
}

// Opens the device's share sheet so the user can send the PDF to any app.
// Where sharing isn't supported (e.g. some desktop browsers), it downloads the PDF and copies a summary instead.
async function sharePdf(file, title, text, download) {
  if (navigator.share) {
    const withFile = navigator.canShare && navigator.canShare({ files: [file] })
    if (!withFile) download()
    try {
      await navigator.share(withFile ? { files: [file], title, text } : { title, text })
      return withFile ? 'shared' : 'shared-text'
    } catch (err) {
      if (err.name === 'AbortError') return 'cancelled'
    }
    if (!withFile) return 'downloaded'
  }

  download()
  try {
    await navigator.clipboard.writeText(text)
    return 'downloaded-copied'
  } catch {
    return 'downloaded'
  }
}

export async function shareInvoice(data) {
  const file = await invoiceFile(data)
  return sharePdf(file, data.invoiceNumber, invoiceMessage(data), () => downloadInvoice(data))
}

// STATEMENT ------------------------------------------------------------
// data: { customer, date, orders: [{ invoice_number, created_at, due_date, total, paid, balance, overdue }],
//         payments: [{ paid_at, invoice_number, method, amount }] }

function statementTotals(data) {
  let owed = 0
  let overdue = 0
  let bought = 0
  let paid = 0
  for (const o of data.orders) {
    bought += Number(o.total)
    paid += Number(o.paid)
    owed += Math.max(0, Number(o.balance))
    if (o.overdue) overdue += Number(o.balance)
  }
  return { owed, overdue, bought, paid }
}

function statementName(data) {
  return 'Statement-' + data.customer.name.replace(/[^a-z0-9]+/gi, '-') + '-' + new Date(data.date).toISOString().slice(0, 10)
}

const methodNames = { cash: 'Cash', mobile_money: 'Mobile money', bank_transfer: 'Bank transfer', other: 'Other' }

export function buildStatement(data, { jsPDF, autoTable, logoData }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const t = statementTotals(data)

  drawHeader(doc, logoData, 'STATEMENT', ['Date: ' + shortDate(data.date)])

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...BLUE)
  doc.text('CUSTOMER', M, 54)
  doc.setFontSize(12)
  doc.setTextColor(...TEXT)
  doc.text(data.customer.name, M, 60)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  const contact = [data.customer.phone, data.customer.location].filter(Boolean).join('   |   ')
  if (contact) doc.text(contact, M, 65.5)

  const boxW = 58
  const boxX = W - M - boxW
  doc.setFillColor(...(t.owed > 0.005 ? NAVY : OK))
  doc.roundedRect(boxX, 50, boxW, 18, 3, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text(t.owed > 0.005 ? 'TOTAL OWED' : 'NOTHING OWED', boxX + 5, 56)
  doc.setFontSize(13)
  doc.text(fmt(t.owed), boxX + 5, 63.5)
  let noteY = 73
  if (t.overdue > 0.005) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...RED)
    doc.text('Overdue: ' + fmt(t.overdue), W - M, noteY, { align: 'right' })
    noteY += 4.5
  }
  if (Number(data.credit) > 0.005) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...BLUE)
    doc.text('Credit held for future orders: ' + fmt(data.credit), W - M, noteY, { align: 'right' })
    noteY += 4.5
  }

  autoTable(doc, {
    startY: Math.max(78, noteY + 2),
    head: [['Invoice', 'Date', 'Due', 'Amount', 'Paid', 'Balance']],
    body: data.orders.map((o) => [
      o.invoice_number,
      shortDate(o.created_at),
      o.due_date ? shortDate(o.due_date) : '-',
      fmt(o.total),
      fmt(o.paid),
      Number(o.balance) > 0.005 ? fmt(o.balance) + (o.overdue ? '\nOVERDUE' : '') : 'Paid',
    ]),
    foot: [['Total', '', '', fmt(t.bought), fmt(t.paid), fmt(t.owed)]],
    margin: { left: M, right: M },
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 2.8, textColor: TEXT, lineColor: LINE, lineWidth: { bottom: 0.2 } },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', lineWidth: 0 },
    footStyles: { fillColor: SOFT, fontStyle: 'bold' },
    columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } },
    didParseCell: (hook) => {
      if (hook.section !== 'body' && hook.column.index >= 3) hook.cell.styles.halign = 'right'
      if (hook.section === 'body' && hook.column.index === 5 && String(hook.cell.raw).includes('OVERDUE')) {
        hook.cell.styles.textColor = RED
      }
    },
  })

  let y = doc.lastAutoTable.finalY + 8

  if (data.payments.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...BLUE)
    doc.text(data.payments.some((p) => p.refund) ? 'PAYMENTS AND REFUNDS' : 'PAYMENTS RECEIVED', M, y)
    autoTable(doc, {
      startY: y + 2,
      head: [['Date', 'Invoice', 'Method', 'Amount']],
      body: data.payments.map((p) => [
        shortDate(p.paid_at),
        p.invoice_number,
        (p.refund ? 'Refund, ' : '') + (methodNames[p.method] || p.method),
        (p.refund ? '- ' : '') + fmt(p.amount),
      ]),
      didParseCell: (hook) => {
        if (hook.section === 'head' && hook.column.index === 3) hook.cell.styles.halign = 'right'
        if (hook.section === 'body' && String(hook.row.raw[2]).startsWith('Refund')) hook.cell.styles.textColor = RED
      },
      margin: { left: M, right: M },
      theme: 'plain',
      styles: { fontSize: 8.5, cellPadding: 2.4, textColor: TEXT, lineColor: LINE, lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: SOFT, textColor: MUTED, fontStyle: 'bold', lineWidth: 0 },
      columnStyles: { 3: { halign: 'right' } },
    })
    y = doc.lastAutoTable.finalY + 8
  }

  if (t.owed > 0.005) {
    if (y + 40 > 280) {
      doc.addPage()
      y = 20
    }
    drawBankBox(doc, y)
  }

  drawFooter(doc)
  return doc
}

export function statementMessage(data) {
  const t = statementTotals(data)
  const lines = ['Statement from ' + company.name, 'Customer: ' + data.customer.name, 'Date: ' + shortDate(data.date), '']
  for (const o of data.orders) {
    if (Number(o.balance) > 0.005) {
      lines.push(o.invoice_number + ' (' + shortDate(o.created_at) + '): ' + fmt(o.balance) + (o.overdue ? ' OVERDUE' : ''))
    }
  }
  lines.push('', 'TOTAL OWED: ' + fmt(t.owed))
  if (Number(data.credit) > 0.005) lines.push('Credit held for future orders: ' + fmt(data.credit))
  if (t.owed > 0.005) {
    lines.push('Pay to ' + company.bank.name + ', account ' + company.bank.account + ', merchant no ' + company.bank.merchantNo +
      ' (' + company.bank.accountName + ').', 'Send proof of payment to WhatsApp ' + company.whatsapp + '.')
  }
  return lines.join('\n')
}

export async function downloadStatement(data) {
  buildStatement(data, await loadPdf()).save(statementName(data) + '.pdf')
}

export async function shareStatement(data) {
  const blob = buildStatement(data, await loadPdf()).output('blob')
  const file = new File([blob], statementName(data) + '.pdf', { type: 'application/pdf' })
  return sharePdf(file, 'Statement', statementMessage(data), () => downloadStatement(data))
}

// RECEIPT ---------------------------------------------------------------
// data: { receiptNumber, date, customer, amount, method, note, receivedBy,
//         allocations: [{ invoiceNumber, amount }], balanceAfter (or null), reversed }

export function buildReceipt(data, { jsPDF, autoTable, logoData }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  drawHeader(doc, logoData, 'RECEIPT', ['No. ' + data.receiptNumber, 'Date: ' + shortDate(data.date)])

  if (data.reversed) {
    doc.setFillColor(...RED)
    doc.roundedRect(W - M - 32, 49, 32, 7.5, 3.75, 3.75, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(255, 255, 255)
    doc.text('REVERSED', W - M - 16, 54, { align: 'center' })
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...BLUE)
  doc.text('RECEIVED FROM', M, 54)
  doc.setFontSize(12)
  doc.setTextColor(...TEXT)
  doc.text(data.customer.name, M, 60)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  const contact = [data.customer.phone, data.customer.location].filter(Boolean).join('   |   ')
  if (contact) doc.text(contact, M, 65.5)

  // Amount box
  const y = 74
  doc.setFillColor(...(data.reversed ? MUTED : OK))
  doc.roundedRect(M, y, W - 2 * M, 22, 3, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('AMOUNT RECEIVED', M + 6, y + 8)
  doc.setFontSize(18)
  doc.text(fmt(data.amount), M + 6, y + 17)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Paid by ' + (methodNames[data.method] || data.method), W - M - 6, y + 9, { align: 'right' })
  if (data.receivedBy) doc.text('Received by ' + data.receivedBy, W - M - 6, y + 15, { align: 'right' })

  let ty = y + 30
  if (data.allocations.length > 0) {
    autoTable(doc, {
      startY: ty,
      head: [['Applied to invoice', 'Amount']],
      body: data.allocations.map((a) => [a.invoiceNumber, fmt(a.amount)]),
      margin: { left: M, right: M },
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 3, textColor: TEXT, lineColor: LINE, lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', lineWidth: 0 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: (hook) => { if (hook.section === 'head' && hook.column.index === 1) hook.cell.styles.halign = 'right' },
    })
    ty = doc.lastAutoTable.finalY + 8
  }

  if (data.note) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.setTextColor(...MUTED)
    const lines = doc.splitTextToSize('Note: ' + data.note, W - 2 * M).slice(0, 3)
    doc.text(lines, M, ty)
    ty += lines.length * 4 + 4
  }

  if (!data.reversed && data.balanceAfter !== null && data.balanceAfter !== undefined) {
    const owes = Number(data.balanceAfter) > 0.005
    doc.setFillColor(...SOFT)
    doc.setDrawColor(...LINE)
    doc.roundedRect(M, ty, W - 2 * M, 14, 3, 3, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...(owes ? RED : OK))
    doc.text(owes ? 'Balance still owed after this payment' : 'All invoices are now fully paid', M + 6, ty + 8.8)
    if (owes) doc.text(fmt(data.balanceAfter), W - M - 6, ty + 8.8, { align: 'right' })
    ty += 18
  }

  // Money kept for future orders (a deposit or overpayment)
  if (!data.reversed && Number(data.creditAfter) > 0.005) {
    doc.setFillColor(...SOFT)
    doc.setDrawColor(...LINE)
    doc.roundedRect(M, ty, W - 2 * M, 14, 3, 3, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(...BLUE)
    doc.text('Credit kept for future orders', M + 6, ty + 8.8)
    doc.text(fmt(data.creditAfter), W - M - 6, ty + 8.8, { align: 'right' })
  }

  drawFooter(doc)
  return doc
}

export function receiptMessage(data) {
  const lines = [
    'Receipt ' + data.receiptNumber + ' - ' + company.name,
    'Received from: ' + data.customer.name,
    'Date: ' + shortDate(data.date),
    'Amount: ' + fmt(data.amount) + ' (' + (methodNames[data.method] || data.method) + ')',
  ]
  if (data.allocations.length > 0) lines.push('For: ' + data.allocations.map((a) => a.invoiceNumber).join(', '))
  if (data.balanceAfter !== null && data.balanceAfter !== undefined) {
    lines.push(Number(data.balanceAfter) > 0.005 ? 'Balance still owed: ' + fmt(data.balanceAfter) : 'All invoices fully paid. Thank you!')
  }
  if (Number(data.creditAfter) > 0.005) lines.push('Credit kept for future orders: ' + fmt(data.creditAfter))
  return lines.join('\n')
}

export async function downloadReceipt(data) {
  buildReceipt(data, await loadPdf()).save(data.receiptNumber + '.pdf')
}

export async function shareReceipt(data) {
  const blob = buildReceipt(data, await loadPdf()).output('blob')
  const file = new File([blob], data.receiptNumber + '.pdf', { type: 'application/pdf' })
  return sharePdf(file, data.receiptNumber, receiptMessage(data), () => downloadReceipt(data))
}

// REFUND NOTE -------------------------------------------------------------
// data: { refundNumber, date, customer, amount, method, note, invoiceNumber, by, items: [{ name, qty }] }

export function buildRefund(data, { jsPDF, autoTable, logoData }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  drawHeader(doc, logoData, 'REFUND', ['No. ' + data.refundNumber, 'Date: ' + shortDate(data.date)])

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...BLUE)
  doc.text('REFUNDED TO', M, 54)
  doc.setFontSize(12)
  doc.setTextColor(...TEXT)
  doc.text(data.customer.name, M, 60)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  const contact = [data.customer.phone, data.customer.location].filter(Boolean).join('   |   ')
  if (contact) doc.text(contact, M, 65.5)

  const y = 74
  doc.setFillColor(...RED)
  doc.roundedRect(M, y, W - 2 * M, 22, 3, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text('AMOUNT REFUNDED', M + 6, y + 8)
  doc.setFontSize(18)
  doc.text(fmt(data.amount), M + 6, y + 17)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Paid by ' + (methodNames[data.method] || data.method), W - M - 6, y + 9, { align: 'right' })
  doc.text('For invoice ' + data.invoiceNumber, W - M - 6, y + 15, { align: 'right' })

  let ty = y + 30
  if (data.items.length > 0) {
    autoTable(doc, {
      startY: ty,
      head: [['Items returned', 'Qty']],
      body: data.items.map((i) => [i.name, i.qty]),
      margin: { left: M, right: M },
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 3, textColor: TEXT, lineColor: LINE, lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold', lineWidth: 0 },
      columnStyles: { 1: { halign: 'center', cellWidth: 20 } },
      didParseCell: (hook) => { if (hook.section === 'head' && hook.column.index === 1) hook.cell.styles.halign = 'center' },
    })
    ty = doc.lastAutoTable.finalY + 8
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...MUTED)
  if (data.note) {
    const lines = doc.splitTextToSize('Reason: ' + data.note, W - 2 * M).slice(0, 3)
    doc.text(lines, M, ty)
    ty += lines.length * 4 + 3
  }
  if (data.by) doc.text('Refund made by ' + data.by, M, ty)

  drawFooter(doc)
  return doc
}

export function refundMessage(data) {
  return [
    'Refund ' + data.refundNumber + ' - ' + company.name,
    'To: ' + data.customer.name,
    'Date: ' + shortDate(data.date),
    'Amount refunded: ' + fmt(data.amount) + ' (' + (methodNames[data.method] || data.method) + ')',
    'For invoice ' + data.invoiceNumber,
  ].join('\n')
}

export async function downloadRefund(data) {
  buildRefund(data, await loadPdf()).save(data.refundNumber + '.pdf')
}

export async function shareRefund(data) {
  const blob = buildRefund(data, await loadPdf()).output('blob')
  const file = new File([blob], data.refundNumber + '.pdf', { type: 'application/pdf' })
  return sharePdf(file, data.refundNumber, refundMessage(data), () => downloadRefund(data))
}

export function shareNotice(result) {
  if (result === 'shared-text') return 'The PDF was downloaded. Attach it to your message.'
  if (result === 'downloaded-copied') return 'Sharing is not available in this browser. The PDF was downloaded and a summary was copied, so you can paste it anywhere.'
  if (result === 'downloaded') return 'Sharing is not available in this browser. The PDF was downloaded so you can send it.'
  return ''
}
