import { LegalDocument, type LegalSection } from '@/components/legal-document';

// When this changes materially, bump PRIVACY_VERSION in server/src/privacy.ts so users accept it again.
const sections: LegalSection[] = [
  {
    heading: 'What AgriMarket does',
    paragraphs: [
      'AgriMarket is a directory that links verified agricultural businesses with buyers. It does not sell anything itself, take payments, hold money or arrange delivery. Buyers and sellers agree price, payment, quality and delivery directly with each other.',
    ],
  },
  {
    heading: 'Your account',
    bullets: [
      'Give true information and keep it up to date.',
      'Keep your password private. You are responsible for what happens on your account.',
      'One person or business per account. Do not create accounts for someone else without their permission.',
    ],
  },
  {
    heading: 'If you sell',
    bullets: [
      'Only list products and services you can actually supply, with honest descriptions.',
      'Only upload photos you took yourself or have permission to use.',
      'Hold any licence the law requires for your service, for example a SACAA Remote Pilot Licence and Remote Operating Certificate for drone work.',
      'Your business and every listing are checked by an administrator before buyers can see them, and photos you replace are checked again.',
    ],
  },
  {
    heading: 'Not allowed',
    bullets: [
      'Scams, fake businesses or listings, and asking for payment before the buyer has seen the goods or confirmed the service.',
      'Misleading prices, false claims of AgriSETA support, or someone else’s photos or documents.',
      'Harassment, offensive content, or using enquiries to send spam.',
    ],
  },
  {
    heading: 'What we may do',
    paragraphs: [
      'Administrators may reject applications, refuse or take down listings, and close accounts that break these terms, especially after a report of a scam. We tell sellers when a listing is taken down. If you think we made a mistake, contact us through Help & support.',
    ],
  },
  {
    heading: 'Responsibility',
    paragraphs: [
      'We check sellers’ documents, but we cannot guarantee the quality of goods or services, or that a deal will go as agreed. Take the safety steps on each listing page before you pay or deliver anything. AgriMarket is not responsible for losses from deals between buyers and sellers.',
    ],
  },
  {
    heading: 'Leaving AgriMarket',
    paragraphs: [
      'You can ask for your account to be deleted at any time from your Profile page. The Privacy notice explains what is removed and what is kept.',
    ],
  },
  {
    heading: 'Changes',
    paragraphs: [
      'If these terms or the Privacy notice change in an important way, we will ask you to accept the new version the next time you sign in.',
    ],
  },
];

export default function TermsScreen() {
  return (
    <LegalDocument
      eyebrow="TERMS OF USE"
      title="Terms of use"
      subtitle="The rules for buying, selling and using AgriMarket."
      updated="19 November 2026"
      sections={sections}
    />
  );
}
