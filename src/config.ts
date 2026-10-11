import brand from '../brand.json';

/** The app's name: change it in brand.json at the project root. */
export const APP_NAME = brand.name;
export const APP_TAGLINE = brand.tagline;
/** File-name-safe version of the name, e.g. for backups ("intercede-backup-2026-10-11.json"). */
export const APP_SLUG = brand.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'prayers';

export const donationLinks = {
  kofi: (import.meta.env.VITE_KOFI_URL as string | undefined)?.trim() || '',
  stripe: (import.meta.env.VITE_STRIPE_URL as string | undefined)?.trim() || '',
};

export const hasDonationLinks = Boolean(donationLinks.kofi || donationLinks.stripe);
