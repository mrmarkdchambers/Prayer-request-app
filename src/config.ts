export const donationLinks = {
  kofi: (import.meta.env.VITE_KOFI_URL as string | undefined)?.trim() || '',
  stripe: (import.meta.env.VITE_STRIPE_URL as string | undefined)?.trim() || '',
};

export const hasDonationLinks = Boolean(donationLinks.kofi || donationLinks.stripe);
