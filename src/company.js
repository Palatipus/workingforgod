import { supabase } from './supabase'

// Built-in defaults. The real values come from the company_settings table (editable on the Settings page)
// and are copied into this object, so invoices, receipts and statements always use the latest details.
export const company = {
  name: "WORKING FOR GOD VENTURES",
  tagline: "Mindray specialists  |  Lab equipment, reagents and training",
  phone: "0549576787",
  whatsapp: "0549576787",
  email: "oseigyamfikelvinkwaku@gmail.com",
  address: [
    "Behind Roman Catholic Church, Bantama.",
    "Adjacent Atwima Kwawoma Rural Bank Ltd",
    "Closer to Race Course",
  ],
  bank: {
    name: "CAL BANK",
    account: "1400004948868",
    merchantNo: "0598591194",
    accountName: "WORKING FOR GOD VENTURES",
  },
  terms: [
    "Payment shall be made in accordance with the agreed terms. Cash customers are required to pay immediately unless otherwise agreed in writing. For credit customers, payment is due on or before the agreed due date.",
    "Customers are requested to inspect all goods upon delivery. Any shortages, damages or discrepancies should be reported within 12 hours of receipt.",
    "Please quote the invoice number in all payments and correspondence relating to this transaction. This invoice serves as evidence of the transaction and should be retained for your records.",
    "When mobile money, bank transfer or any other payment is made, please send a screenshot or take a picture of the slip and send it to this WhatsApp number 0549576787.",
  ],
};

export function applyCompany(data) {
  if (!data) return
  Object.assign(company, data, { bank: { ...company.bank, ...(data.bank || {}) } })
}

let loading = null

// Loads the saved details once per session (call again with force after saving)
export function loadCompany(force = false) {
  if (!loading || force) {
    loading = supabase.from('company_settings').select('data').eq('id', 1).maybeSingle()
      .then(({ data, error }) => {
        if (error) loading = null
        else applyCompany(data?.data)
      })
      .catch(() => { loading = null })
  }
  return loading || Promise.resolve()
}

