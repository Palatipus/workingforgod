export function money(n, digits = 2) {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency', currency: 'GHS', minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(n || 0)
}

export function stockStatus(product) {
  if (product.stock_qty === 0) return { label: 'Out of stock', cls: 'bg-red-50 text-red-600' }
  if (product.stock_qty <= product.reorder_level) return { label: 'Low stock', cls: 'bg-amber-50 text-amber-700' }
  return { label: 'In stock', cls: 'bg-emerald-50 text-emerald-700' }
}

export const paymentMethods = [
  ['cash', 'Cash'],
  ['mobile_money', 'Mobile money'],
  ['bank_transfer', 'Bank transfer'],
  ['other', 'Other'],
]

export function methodLabel(key) {
  const found = paymentMethods.find(([k]) => k === key)
  return found ? found[1] : key
}

// Cleans text for use inside a database search filter (commas, brackets and wildcards would break it)
export function searchTerm(text) {
  return text.trim().replace(/[,()%*\\:"]/g, ' ').replace(/\s+/g, ' ')
}

export function today() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

// Same rule as valid_username() in the database: 3-30 characters, letters, numbers, dots, dashes, underscores
export function cleanUsername(text) {
  return text.trim().toLowerCase()
}

export function validUsername(name) {
  return /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(name)
}

export const usernameRule = 'Username must be 3-30 characters: letters, numbers, dots, dashes or underscores.'
