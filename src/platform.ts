import { Capacitor } from '@capacitor/core';
import brand from '../brand.json';

/** 'ios' or 'android' inside the store apps; 'web' in a browser or installed web app. */
export const platform = Capacitor.getPlatform() as 'ios' | 'android' | 'web';
export const isNativeApp = Capacitor.isNativePlatform();

/**
 * The public web address. Inside the store apps the page's own origin is a
 * local one (capacitor://localhost), so links meant for other people (invites,
 * calendar reminders, sign-in emails) always use the website instead.
 */
export const publicUrl = (isNativeApp ? brand.webUrl : `${location.origin}${location.pathname}`).replace(/\/?$/, '/');

/** iPhones and iPads only allow web notifications once the site is added to the Home Screen. */
export function needsHomeScreenForPush(): boolean {
  if (isNativeApp) return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}
