// Sends a phone notification for one row of the notifications table.
// Called by the push_notification trigger (schema_update_13.sql), never by the app itself.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

// Same places the bell sends you (notificationTarget in NotificationBell.jsx)
function target(n: { link?: string; order_id?: string; message: string }) {
  if (n.link) return n.link
  if (n.order_id) return '/orders?order=' + n.order_id
  if (n.message.includes('waiting for approval')) return '/team'
  return '/notifications'
}

Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) {
    return new Response('Forbidden', { status: 403 })
  }

  const { record } = await req.json()
  const { data: devices, error } = await supabase
    .from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', record.user_id)
  if (error) return new Response(error.message, { status: 500 })

  const payload = JSON.stringify({
    title: 'WFG Sales',
    body: record.message,
    url: target(record),
    tag: record.id,
  })

  const gone: string[] = []
  await Promise.all((devices ?? []).map(async (d) => {
    try {
      await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, {
        TTL: 86400,
        // High priority: phones deliver it right away instead of holding it until the app or screen wakes up
        urgency: 'high',
      })
    } catch (err) {
      // The phone unsubscribed, uninstalled the app or cleared its data
      if (err.statusCode === 404 || err.statusCode === 410) gone.push(d.id)
      else console.error('push failed', err.statusCode, err.body)
    }
  }))
  if (gone.length) await supabase.from('push_subscriptions').delete().in('id', gone)

  return new Response(JSON.stringify({ sent: (devices?.length ?? 0) - gone.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
