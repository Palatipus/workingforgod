// Builds error-codes.pdf from the codes in src/errors.js: npm run error-codes
import { writeFileSync } from 'fs'
import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { userErrors, techErrors } from '../src/errors.js'
import { logoData } from '../src/logoData.js'

const NAVY = [11, 42, 74]
const BLUE = [31, 116, 176]
const TEXT = [15, 23, 42]
const MUTED = [100, 116, 139]
const LINE = [226, 232, 240]
const AMBER_BG = [255, 247, 237]
const W = 210
const M = 14

const doc = new jsPDF({ unit: 'mm', format: 'a4' })

doc.setFillColor(...NAVY)
doc.rect(0, 0, W, 34, 'F')
doc.addImage(logoData, 'PNG', M, 7, 20, 20)
doc.setTextColor(255, 255, 255)
doc.setFont('helvetica', 'bold')
doc.setFontSize(18)
doc.text('Error codes', M + 25, 17)
doc.setFont('helvetica', 'normal')
doc.setFontSize(9)
doc.setTextColor(200, 222, 242)
doc.text('WFG Inventory and Sales: what each code means and how to fix it', M + 25, 23.5)
doc.text('Updated ' + new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }), W - M, 23.5, { align: 'right' })

doc.setTextColor(...TEXT)
doc.setFontSize(9)
const intro = doc.splitTextToSize(
  'Every error in the app has a code. E1xx to E5xx are mistakes staff can fix themselves: the message on screen ' +
  'says what is wrong. E9xx are technical problems: staff are asked to send a screenshot to the developer on WhatsApp. ' +
  'The screenshot shows the code, the technical details after it, and the page in [brackets].', W - 2 * M)
doc.text(intro, M, 43)

const table = (startY, title, head, body, widths) => {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...BLUE)
  doc.text(title, M, startY)
  autoTable(doc, {
    startY: startY + 3,
    head: [head],
    body,
    margin: { left: M, right: M },
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 2.4, textColor: TEXT, lineColor: LINE, lineWidth: { bottom: 0.2 }, valign: 'top' },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: Object.fromEntries(widths.map((w, i) => [i, w ? { cellWidth: w } : {}])),
    didParseCell: (hook) => {
      if (hook.section === 'body' && hook.column.index === 0) hook.cell.styles.fontStyle = 'bold'
      if (hook.section === 'body' && hook.row.raw.area) {
        hook.cell.colSpan = head.length
        hook.cell.styles.fillColor = AMBER_BG
        hook.cell.styles.fontStyle = 'bold'
      }
    },
  })
  return doc.lastAutoTable.finalY
}

// Group heading rows between areas
function grouped(list, row) {
  const body = []
  let area = ''
  for (const e of list) {
    if (e.area !== area) {
      area = e.area
      const heading = [area]
      heading.area = true
      body.push(heading)
    }
    body.push(row(e))
  }
  return body
}

let y = table(57, 'Mistakes staff can fix', ['Code', 'What it means', 'What to do'],
  grouped(userErrors, (e) => [e.code, e.meaning, e.action]), [16, 86, null])

y += 12
if (y > 230) {
  doc.addPage()
  y = 20
}
table(y, 'Technical problems (contact the developer)', ['Code', 'What it means', 'What staff should do', 'For the developer'],
  techErrors.map((e) => [e.code, e.meaning, e.action, e.developer]), [16, 50, 55, null])

const pages = doc.internal.getNumberOfPages()
for (let i = 1; i <= pages; i++) {
  doc.setPage(i)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text('Codes never change. New codes may be added over time (src/errors.js, then npm run error-codes).', M, 290)
  doc.text('Page ' + i + ' of ' + pages, W - M, 290, { align: 'right' })
}

writeFileSync(new URL('../error-codes.pdf', import.meta.url), Buffer.from(doc.output('arraybuffer')))
console.log('Wrote error-codes.pdf')
