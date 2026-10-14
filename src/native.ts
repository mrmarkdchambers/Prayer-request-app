import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { isNativeApp } from './platform';
import { download } from './lib/download';

/**
 * Things the iPhone/Android apps do differently from the browser, because the
 * app container can't download files or run the web's reminder code.
 */

/** Saves a file: a download in the browser, the Share menu in the apps (Files, Drive, email…). */
export async function saveFile(filename: string, content: string, type: string): Promise<void> {
  if (!isNativeApp) {
    download(filename, content, type);
    return;
  }
  const { uri } = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: filename, files: [uri] });
}

// ---------------------------------------------------------------- daily reminder on the phone itself

const REMINDER_ID = 1;

/** Whether the phone's own daily reminder is scheduled. */
export async function isPhoneReminderOn(): Promise<boolean> {
  if (!isNativeApp) return false;
  const { notifications } = await LocalNotifications.getPending();
  return notifications.some((n) => n.id === REMINDER_ID);
}

/** Schedules (or moves) a daily reminder at HH:MM, repeating every day. Throws a readable error. */
export async function setPhoneReminder(time: string): Promise<void> {
  let perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
  if (perm.display !== 'granted') throw new Error('Notifications are turned off for this app in your phone settings.');
  const [hour, minute] = time.split(':').map(Number);
  await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
  await LocalNotifications.schedule({
    notifications: [
      {
        id: REMINDER_ID,
        title: 'Time to pray',
        body: 'Your prayers for today are ready.',
        schedule: { on: { hour, minute }, allowWhileIdle: true },
        smallIcon: 'ic_stat_notify',
        iconColor: '#4F46E5',
        extra: { url: '/#/session' },
      },
    ],
  });
}

export async function clearPhoneReminder(): Promise<void> {
  await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
}

/** Opens the prayer session when the reminder is tapped. */
export function listenForReminderTaps(open: (path: string) => void): () => void {
  if (!isNativeApp) return () => {};
  const handle = LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const url = action.notification.extra?.url;
    if (typeof url === 'string' && url.startsWith('/#/')) open(url.slice(2));
  });
  return () => {
    handle.then((h) => h.remove());
  };
}
