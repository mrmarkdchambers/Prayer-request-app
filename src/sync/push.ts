import type { SupabaseClient } from '@supabase/supabase-js';
import { PushNotifications } from '@capacitor/push-notifications';
import * as api from './api';
import { isNativeApp, needsHomeScreenForPush, platform } from '../platform';

/**
 * Turns notifications on or off for this device: web push in browsers and
 * installed web apps, Apple/Google push in the store apps.
 */

export type PushSupport = 'supported' | 'needs-home-screen' | 'unsupported';

const ENDPOINT_KEY = 'intercede:push-endpoint';

function savedEndpoint(): string | null {
  try {
    return localStorage.getItem(ENDPOINT_KEY);
  } catch {
    return null;
  }
}

function saveEndpoint(endpoint: string | null) {
  try {
    if (endpoint) localStorage.setItem(ENDPOINT_KEY, endpoint);
    else localStorage.removeItem(ENDPOINT_KEY);
  } catch {
    /* storage blocked */
  }
}

export function pushSupport(): PushSupport {
  if (isNativeApp) return 'supported';
  if (needsHomeScreenForPush()) return 'needs-home-screen';
  return 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined' ? 'supported' : 'unsupported';
}

/** Whether this device is set up to receive notifications for the signed-in account. */
export async function isPushEnabled(): Promise<boolean> {
  if (!savedEndpoint()) return false;
  if (isNativeApp) return (await PushNotifications.checkPermissions()).receive === 'granted';
  if (Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

function keyBytes(base64url: string): Uint8Array {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64url.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function nativeToken(): Promise<string> {
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') throw new Error('Notifications are turned off for this app in your phone settings.');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Couldn't reach the notification service. Try again later.")), 15_000);
    PushNotifications.addListener('registration', (t) => {
      clearTimeout(timer);
      resolve(t.value);
    });
    PushNotifications.addListener('registrationError', (e) => {
      clearTimeout(timer);
      reject(new Error(e.error || 'Notifications could not be set up on this device.'));
    });
    PushNotifications.register();
  });
}

/** Asks permission if needed, subscribes this device, and links it to the account. Throws a readable error. */
export async function enablePush(sb: SupabaseClient): Promise<void> {
  if (isNativeApp) {
    const token = await nativeToken();
    await api.registerPush(sb, platform === 'ios' ? 'apns' : 'fcm', token);
    saveEndpoint(token);
    return;
  }
  const support = pushSupport();
  if (support === 'needs-home-screen') throw new Error('On iPhone and iPad, add this site to your Home Screen first, then turn notifications on from there.');
  if (support === 'unsupported') throw new Error("This browser doesn't support notifications.");

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them for this site in your browser settings, then try again.');

  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const publicKey = await api.vapidPublicKey(sb);
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with a different server key can't receive our messages.
  const current = sub?.options.applicationServerKey;
  if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))) !== btoa(String.fromCharCode(...keyBytes(publicKey)))) {
    await sub.unsubscribe();
    sub = null;
  }
  try {
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource });
  } catch (err) {
    // Browsers report a blocked permission and an unreachable push service with similar errors.
    throw new Error(
      Notification.permission === 'denied'
        ? 'Notifications are blocked. Allow them for this site in your browser settings, then try again.'
        : (err as Error)?.name === 'NotAllowedError'
          ? "This browser won't allow notifications here. In private or incognito windows they're often off; try a normal window."
          : "Couldn't connect to your browser's notification service. Check your connection and try again.",
    );
  }
  const json = sub.toJSON();
  await api.registerPush(sb, 'web', sub.endpoint, { p256dh: json.keys!.p256dh, auth: json.keys!.auth });
  saveEndpoint(sub.endpoint);
}

/** Stops notifications on this device (also used when signing out). */
export async function disablePush(sb: SupabaseClient | null): Promise<void> {
  const endpoint = savedEndpoint();
  saveEndpoint(null);
  if (endpoint && sb) await api.unregisterPush(sb, endpoint).catch(() => {});
  if (isNativeApp) {
    await PushNotifications.unregister().catch(() => {});
    return;
  }
  const reg = await navigator.serviceWorker?.getRegistration();
  await (await reg?.pushManager.getSubscription())?.unsubscribe();
}

/** In the store apps, opens the right screen when someone taps a notification. */
export function listenForNotificationTaps(open: (url: string) => void): () => void {
  if (!isNativeApp) return () => {};
  const handle = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const url = action.notification.data?.url;
    if (typeof url === 'string' && url.startsWith('/#/')) open(url.slice(2));
  });
  return () => {
    handle.then((h) => h.remove());
  };
}
