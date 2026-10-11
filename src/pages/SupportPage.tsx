import { APP_NAME, donationLinks, hasDonationLinks } from '../config';
import { Icon } from '../components/Icon';

export function SupportPage() {
  return (
    <div className="stack narrow">
      <h1>Support {APP_NAME}</h1>
      <p>
        {APP_NAME} is free for everyone: no ads, no premium tier, no selling your data. Every feature, including groups and sync, stays
        free.
      </p>
      <p>If it's helped you pray, a gift helps cover hosting and keeps it growing. Thank you!</p>
      {hasDonationLinks ? (
        <div className="row wrap">
          {donationLinks.stripe && (
            <a className="btn btn-primary btn-lg" href={donationLinks.stripe} target="_blank" rel="noopener noreferrer">
              <Icon name="heart" /> Give
            </a>
          )}
          {donationLinks.kofi && (
            <a className="btn btn-lg" href={donationLinks.kofi} target="_blank" rel="noopener noreferrer">
              Support on Ko-fi
            </a>
          )}
        </div>
      ) : (
        <p className="card muted">Donation links aren't set up yet.</p>
      )}
      <p className="muted">Gifts are not tax-deductible. Supporting is entirely optional and doesn't unlock anything.</p>
    </div>
  );
}
