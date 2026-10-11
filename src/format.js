export function money(n) {
  return new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', maximumFractionDigits: 2 }).format(n || 0)
}

export function stockStatus(product) {
  if (product.stock_qty === 0) return { label: 'Out of stock', cls: 'bg-red-50 text-red-600' }
  if (product.stock_qty <= product.reorder_level) return { label: 'Low stock', cls: 'bg-amber-50 text-amber-700' }
  return { label: 'In stock', cls: 'bg-emerald-50 text-emerald-700' }
}
