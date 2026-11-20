import { LegalDocument, type LegalSection } from '@/components/legal-document';

const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() ?? '';
const contact = SUPPORT_EMAIL ? `email ${SUPPORT_EMAIL}` : 'use Help & support in the app';

// Plain-language notice under the Protection of Personal Information Act (POPIA).
// When this changes materially, bump PRIVACY_VERSION in server/src/privacy.ts so users accept it again.
const sections: LegalSection[] = [
  {
    heading: 'Who we are',
    paragraphs: [
      'AgriMarket links verified farmers, agricultural small businesses and service providers with buyers. AgriMarket is responsible for the personal information described here.',
      `To ask a question about your information or to use your rights, ${contact}.`,
    ],
  },
  {
    heading: 'What we collect',
    bullets: [
      'Everyone: your email address, a protected (hashed) password and whether you buy or sell.',
      'Buyers: the name and type of organisation you buy for, and a saved area if you choose to save one.',
      'Sellers: business name, description, address or farm location, town and province, contact numbers, verification documents, product or service photos, and your AgriSETA programme reference if you give one.',
      'Messages: the enquiries you send or receive, reports you make, and the notifications we show you.',
      'Records of important actions, such as approvals, document views and deletions, kept for security and accountability.',
    ],
  },
  {
    heading: 'Why we use it',
    bullets: [
      'To create and protect your account and keep you signed in.',
      'To check that sellers are genuine businesses before buyers can see them.',
      'To show verified businesses and their offerings to buyers, and to deliver enquiries between buyers and sellers.',
      'To investigate reports of scams or false listings.',
      'To produce reports for partners such as AgriSETA about verified businesses and market activity.',
    ],
  },
  {
    heading: 'Who can see it',
    bullets: [
      'Anyone using AgriMarket: a verified seller’s business name, description, town, province, photos, listings and the contact details the seller chose to show.',
      'A seller you send an enquiry to: your message, your email address and the organisation you buy for.',
      'AgriMarket administrators: what they need to review applications and reports. Verification documents are private, never shown to buyers, and every time an administrator opens one it is recorded.',
      'Partners such as AgriSETA: lists of verified businesses with their contact details and offerings, and enquiry activity without message text or buyer email addresses.',
      'Service providers that run AgriMarket for us: hosting (Render), database (Neon), file storage (Cloudinary), email (Brevo) and location search (Google Maps). Some of them store information outside South Africa, under agreements that require them to protect it.',
    ],
  },
  {
    heading: 'How long we keep it',
    paragraphs: [
      'We keep your information while your account is open. When an account is deleted, your name, email, password, location, business contact details, documents and photos are removed, and your listings are taken down. Messages you exchanged stay with the other business, marked as from a deleted user, and the records of important actions are kept for accountability.',
    ],
  },
  {
    heading: 'How we protect it',
    bullets: [
      'Passwords are stored only as secure hashes.',
      'Connections to AgriMarket are encrypted.',
      'Verification documents are kept in private storage that only administrators can open, and each view is logged.',
      'Sign-in attempts and uploads are rate-limited to slow down attacks.',
    ],
  },
  {
    heading: 'Your rights',
    bullets: [
      'See and correct your information on your Profile page.',
      'Ask for your account to be deleted from your Profile page. An administrator checks for open reports or disputes and then deletes it without undue delay.',
      `Ask what information we hold about you, or object to how we use it: ${contact}.`,
      'Complain to the Information Regulator of South Africa (inforegulator.org.za) if you are not satisfied with our answer.',
    ],
  },
];

export default function PrivacyScreen() {
  return (
    <LegalDocument
      eyebrow="POPIA"
      title="Privacy notice"
      subtitle="What AgriMarket collects about you, why, who sees it and what you can do about it."
      updated="19 November 2026"
      sections={sections}
    />
  );
}
