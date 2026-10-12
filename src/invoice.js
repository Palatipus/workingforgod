import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { logoData } from './logoData'
import { company } from './company'

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

export function buildInvoice(data) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const M = 14
  const t = invoiceTotals(data)
  const statusColor = t.status === 'PAID' ? OK : t.status === 'PART PAID' ? [217, 119, 6] : RED

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
  doc.text('INVOICE', W - M, 19, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(200, 222, 242)
  doc.text('No. ' + data.invoiceNumber, W - M, 26, { align: 'right' })
  doc.text('Date: ' + shortDate(data.date), W - M, 31, { align: 'right' })
  doc.text('Due: ' + (data.dueDate ? shortDate(data.dueDate) : 'On receipt'), W - M, 36, { align: 'right' })

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
      if (hook.section === 'body' && hook.column.index === 1 && String(hook.cell.raw).includes('Pending delivery')) {
        hook.cell.styles.textColor = RED
      }
    },
  })

  let y = doc.lastAutoTable.finalY + 8
  if (y > 200) {
    doc.addPage()
    y = 20
  }

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

  return doc
}

export function downloadInvoice(data) {
  buildInvoice(data).save(data.invoiceNumber + '.pdf')
}

export function invoiceFile(data) {
  const blob = buildInvoice(data).output('blob')
  return new File([blob], data.invoiceNumber + '.pdf', { type: 'application/pdf' })
}

function whatsappNumber(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.startsWith('0')) return '233' + digits.slice(1)
  return digits
}

// Shares the PDF through the phone's share sheet when possible, otherwise opens WhatsApp with a text summary.
export async function shareInvoice(data) {
  const file = invoiceFile(data)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: data.invoiceNumber, text: invoiceMessage(data) })
      return
    } catch (err) {
      if (err.name === 'AbortError') return
    }
  }
  const to = whatsappNumber(data.customer.phone)
  window.open('https://wa.me/' + to + '?text=' + encodeURIComponent(invoiceMessage(data)), '_blank')
}
