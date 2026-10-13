import { Link } from 'react-router-dom';
import { APP_NAME, CONTACT_EMAIL } from '../config';
import { Icon } from '../components/Icon';
import brand from '../../brand.json';

/** The privacy policy. The app stores require a public link to it: <web address>/#/privacy */
export function PrivacyPage() {
  return (
    <article className="stack narrow prose">
      <Link to="/settings" className="back">
        <Icon name="back" /> Settings
      </Link>
      <h1>Privacy policy</h1>
      <p className="muted">Last updated 13 October 2026</p>

      <p>
        {APP_NAME} is a free prayer list. We collect as little as possible, never sell or share your information, and show no ads. There is no
        tracking or analytics of any kind.
      </p>

      <h2>Without an account</h2>
      <p>Everything you enter stays on your device. Nothing is sent to us.</p>

      <h2>With an account</h2>
      <ul>
        <li>
          <strong>Your email address</strong>, to send you sign-in codes. It's never shown to anyone else.
        </li>
        <li>
          <strong>The name you choose</strong>, shown to members of groups you join.
        </li>
        <li>
          <strong>Your prayers</strong> (requests, updates, answers, tags, and how often you've prayed), so they sync between your devices. Only
          you can read them.
        </li>
        <li>
          <strong>Requests you choose to share with a group</strong>: the group's members can see the request, its updates and its answer, plus
          who has prayed for it. Your follow-up dates, schedules and prayer counts stay private.
        </li>
        <li>
          <strong>Notification settings and device push addresses</strong>, if you turn notifications on, so we can deliver them.
        </li>
      </ul>

      <h2>Notifications</h2>
      <p>
        Notifications include a short description, such as who prayed and the request's title. In browsers they are encrypted so only your
        device can read them. In the iPhone and Android apps they are delivered by Apple and Google's notification services, which handle them
        under their own privacy policies.
      </p>

      <h2>Where it's stored</h2>
      <p>
        Account data is stored with Supabase, our database provider, and the website is served by Netlify. Both process data only to provide
        their service to us. Data is encrypted in transit, and access is restricted by database rules so people can only see what's theirs or
        shared with them.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Download a copy of your prayers at any time (Settings → Your data).</li>
        <li>Turn notifications off per device, or per type.</li>
        <li>Leave any group; your requests stop being shared with it.</li>
        <li>
          Delete your account in Settings → Account. This permanently removes your account, prayers, updates and devices. Groups you lead pass
          to another member.
        </li>
      </ul>

      <h2>Children</h2>
      <p>{APP_NAME} is not directed at children under 13, and we don't knowingly collect information from them.</p>

      <h2>Contact</h2>
      <p>
        Questions or requests:{' '}
        {CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : <span>see the contact details on {brand.webUrl}</span>}
      </p>
    </article>
  );
}
