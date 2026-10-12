import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { logoData } from "./logoData";

function fmt(n) {
  return (
    "GHS " +
    Number(n).toLocaleString("en-GH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function downloadInvoice({
  orderNumber,
  date,
  customer,
  salesperson,
  items,
}) {
  const doc = new jsPDF();

  doc.addImage(logoData, "PNG", 14, 10, 22, 22);
  doc.setFontSize(18);
  doc.setTextColor(31, 116, 176);
  doc.text("Working For God Ventures", 40, 20);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("Lab equipment, reagents and Mindray specialists", 40, 26);

  doc.setFontSize(16);
  doc.setTextColor(30);
  doc.text("INVOICE", 196, 20, { align: "right" });
  doc.setFontSize(10);
  doc.text("#" + orderNumber, 196, 27, { align: "right" });
  doc.text(new Date(date).toLocaleDateString(), 196, 33, { align: "right" });

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("BILLED TO", 14, 46);
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text(customer.name, 14, 52);
  doc.setFontSize(9);
  doc.setTextColor(100);
  let y = 58;
  if (customer.phone) {
    doc.text(customer.phone, 14, y);
    y += 5;
  }
  if (customer.location) {
    doc.text(customer.location, 14, y);
    y += 5;
  }
  doc.text("Sales: " + salesperson, 196, 52, { align: "right" });

  let total = 0;
  const rows = [];
  for (const item of items) {
    const amount = item.qty * item.price;
    total += amount;
    let name = item.name;
    if (item.pending_qty > 0)
      name += "\n(" + item.pending_qty + " to be delivered later)";
    rows.push([name, item.qty, fmt(item.price), fmt(amount)]);
  }

  autoTable(doc, {
    startY: Math.max(y + 6, 72),
    head: [["Item", "Qty", "Unit price", "Amount"]],
    body: rows,
    headStyles: { fillColor: [31, 116, 176] },
    columnStyles: {
      1: { halign: "center" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });

  const endY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.setTextColor(30);
  doc.text("Total: " + fmt(total), 196, endY, { align: "right" });
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("Thank you for your business", 14, endY + 16);

  doc.save("invoice-" + orderNumber + ".pdf");
}
