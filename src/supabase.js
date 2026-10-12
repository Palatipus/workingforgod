import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const missingConfig = !url || !key

export const supabase = createClient(
  url || 'https://missing.supabase.co',
  key || 'missing-key'
)

// Supabase returns at most 1000 rows per request. For lists that can grow past that
// (customers, products, ...), fetch page by page until everything is in.
// Pass a function that builds a fresh query each time. Returns { data, error } like a normal query.
export async function selectAll(makeQuery) {
  const size = 1000
  const all = []
  for (let from = 0; ; from += size) {
    const { data, error } = await makeQuery().range(from, from + size - 1)
    if (error) return { data: null, error }
    all.push(...data)
    if (data.length < size) return { data: all, error: null }
  }
}

