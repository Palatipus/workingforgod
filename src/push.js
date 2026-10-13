import { supabase } from './supabase'

// Phone notifications: the browser gives us an address for this device, we save it in
// push_subscriptions, and the send-push Supabase function delivers each new notification there.
const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// The service worker is only registered in production (see main.jsx)
export const pushSupported = !!VAPID_KEY && import.meta.env.PROD &&
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

// iPhones only allow notifications once the app is added to the Home Screen and opened from there
export const needsHomeScreen = /iphone|ipad|ipod/i.test(navigator.userAgent) &&
  !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone

export function pushPermission() {
  return 'Notification' in window ? Notification.permission : 'denied'
}

function keyBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

async function save(sub) {
  const json = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: json.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth,
  })
  if (error) throw error
}

// Ask permission (must be called from a tap) and register this device. Returns true when on.
export async function enablePush() {
  if (!pushSupported) return false
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription() ||
    await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_KEY) })
  await save(sub)
  return true
}

// On every app start: if notifications are allowed, make sure this device is saved for whoever is signed in
export async function syncPush() {
  if (!pushSupported || pushPermission() !== 'granted') return
  try { await enablePush() } catch { /* tried again next time the app opens */ }
}

export async function pushEnabledHere() {
  if (!pushSupported || pushPermission() !== 'granted') return false
  const reg = await navigator.serviceWorker.getRegistration()
  return !!(reg && await reg.pushManager.getSubscription())
}

// Stop sending to this device (turning off, or signing out so the next person doesn't get them)
export async function disablePush() {
  if (!pushSupported) return
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = reg && await reg.pushManager.getSubscription()
    if (!sub) return
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  } catch { /* signing out must still work */ }
}
