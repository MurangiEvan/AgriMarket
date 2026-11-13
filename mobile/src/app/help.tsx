import { Link } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { PageHero } from '@/components/page-hero';
import { useSession } from '@/components/session-provider';

// Support inbox address, set per build (EXPO_PUBLIC_SUPPORT_EMAIL in eas.json and on Render).
const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim() ?? '';

type Question = { q: string; a: string };
type Section = { key: 'sellers' | 'buyers' | 'account' | 'safety'; title: string; icon: string; questions: Question[] };

const sections: Section[] = [
  {
    key: 'sellers',
    title: 'For sellers',
    icon: '🌱',
    questions: [
      {
        q: 'How do I get my business verified?',
        a: 'Open Profile and complete the three steps of your application: your business details, your verification documents (such as a CIPC registration certificate) and a photo of your produce. Then tap "Submit application". Everything goes to an AgriMarket administrator together, and you get a notification when it has been reviewed.',
      },
      {
        q: 'What can I offer on AgriMarket?',
        a: 'Produce, livestock, processed products, and services: agricultural services, equipment hire and repairs, drone services, logistics and transport, and consulting and training. Choose the category that fits and add a photo that shows what you offer.',
      },
      {
        q: 'What does the AgriSETA-supported badge mean?',
        a: 'If AgriSETA has supported your business (for example through a learnership, skills programme or grant), tick the AgriSETA box on your application and add the programme or reference. The admin checks it before buyers see the badge, and buyers can filter the directory to AgriSETA-supported businesses.',
      },
      {
        q: 'Which documents can I upload?',
        a: 'PDF, JPEG or PNG files. You can add up to 5 documents, each up to 10 MB. Make sure every page is clear and readable. They are only sent when you submit your application.',
      },
      {
        q: 'Why is my produce photo not showing to buyers?',
        a: 'Your first photo is sent with your application and goes live when the application is approved. After that you can add more photos from your Profile page; each one is checked by an administrator before buyers can see it, and shows as waiting until then.',
      },
      {
        q: 'My verification was rejected. What now?',
        a: 'Open Profile and read the administrator\'s feedback at the top of the page. Fix what they asked for, then submit the whole application again with your documents and a produce photo.',
      },
      {
        q: 'How do I reply to a buyer?',
        a: 'Open Enquiries to see each message and the buyer\'s email address. Contact the buyer directly, then tap "Mark responded" so you can keep track.',
      },
    ],
  },
  {
    key: 'buyers',
    title: 'For buyers',
    icon: '🧺',
    questions: [
      {
        q: 'Who can buy on AgriMarket?',
        a: 'Businesses and organisations that buy from farmers and agricultural suppliers: retailers, hotels, restaurants, processors, exporters, municipalities, government programmes, schools, commercial farms and informal traders. Add your organisation name and type on your Profile page before your first enquiry, so sellers know who they are dealing with.',
      },
      {
        q: 'How do I find produce near me?',
        a: 'Open Near me and tap "Use my current location", or save an area such as your town or suburb. You will see produce from verified suppliers near you, with the distance to the nearest one. You can also use Search to look through the whole directory.',
      },
      {
        q: 'My location is not working.',
        a: 'Check that location access is allowed for AgriMarket in your phone or browser settings. If it still fails, save your town or suburb as your area (for example Tzaneen or Sandton) and tap "Use my saved location".',
      },
      {
        q: 'How do I contact a supplier?',
        a: 'Open a listing and send an enquiry, or use the supplier\'s Call, WhatsApp or Email buttons when they are shown. Your sent enquiries and their status appear under Enquiries.',
      },
    ],
  },
  {
    key: 'account',
    title: 'Your account',
    icon: '👤',
    questions: [
      {
        q: 'I forgot my password.',
        a: 'On the sign-in screen tap "Forgot password?" and enter your email. We send you a reset link that works once and expires after 30 minutes. Check your spam folder if it does not arrive.',
      },
      {
        q: 'How do I sign out?',
        a: 'Tap the ☰ menu button at the top right and choose "Sign out", or use the Sign out button on your Profile page.',
      },
      {
        q: 'How do I change my details?',
        a: 'Sellers can update their business name, description, location and contact details on the Profile page. To change the email address you sign in with, contact support.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Contact support from the email address linked to your account and ask for it to be deleted.',
      },
    ],
  },
  {
    key: 'safety',
    title: 'Safety & privacy',
    icon: '🛡️',
    questions: [
      {
        q: 'Who can see my verification documents?',
        a: 'Only authorised AgriMarket administrators. Documents are stored privately, are never shown to buyers, and every time an administrator opens one it is recorded in an audit log.',
      },
      {
        q: 'Does AgriMarket handle payments or delivery?',
        a: 'No. AgriMarket connects buyers and sellers. Prices, payment and delivery are agreed directly between you and the other business. Never pay before you are confident the business is genuine.',
      },
      {
        q: 'How do I report a suspicious seller or listing?',
        a: 'Email support with the business name, the listing and what happened. An administrator will look into it.',
      },
    ],
  },
];

export default function HelpScreen() {
  const { user } = useSession();
  const [open, setOpen] = useState<string | null>(null);
  // Show the signed-in user's own questions first.
  const ordered = [...sections].sort((a, b) => rank(a.key, user?.role) - rank(b.key, user?.role));

  function emailSupport() {
    const subject = encodeURIComponent('AgriMarket support request');
    const body = encodeURIComponent(user ? `\n\n---\nAccount: ${user.email} (${user.role})` : '');
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.frame}>
        {/* Signed-out visitors have no app menu around this page, so give them a way back. */}
        {!user ? <BackButton fallback="/sign-in" /> : null}
        <PageHero eyebrow="HELP & SUPPORT" title="How can we help?" subtitle="Answers to common questions about selling, buying and your account." />

        <View style={styles.contactCard}>
          <Text style={styles.contactIcon} accessible={false}>✉️</Text>
          <View style={styles.contactCopy}>
            <Text accessibilityRole="header" style={styles.cardTitle}>Contact support</Text>
            {SUPPORT_EMAIL ? (
              <>
                <Text style={styles.body}>Can&apos;t find your answer? Email us and include your business name or the listing you need help with.</Text>
                <Pressable accessibilityRole="link" accessibilityLabel={`Email support at ${SUPPORT_EMAIL}`} onPress={emailSupport} style={styles.primary}>
                  <Text style={styles.primaryText}>Email support</Text>
                </Pressable>
                <Text selectable style={styles.email}>{SUPPORT_EMAIL}</Text>
              </>
            ) : (
              <Text style={styles.body}>Email support is being set up. In the meantime, the answers below cover the most common questions.</Text>
            )}
          </View>
        </View>

        {ordered.map((section) => (
          <View key={section.key} style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{section.icon}  {section.title}</Text>
            <View style={styles.card}>
              {section.questions.map((item, index) => {
                const id = `${section.key}-${index}`;
                const expanded = open === id;
                return (
                  <View key={id} style={[styles.item, index > 0 && styles.itemDivider]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      onPress={() => setOpen(expanded ? null : id)}
                      style={styles.question}
                    >
                      <Text style={styles.questionText}>{item.q}</Text>
                      <Text style={styles.chevron} accessible={false}>{expanded ? '−' : '+'}</Text>
                    </Pressable>
                    {expanded ? <Text style={styles.answer}>{item.a}</Text> : null}
                  </View>
                );
              })}
            </View>
          </View>
        ))}

        {!user ? (
          <View style={styles.card}>
            <Text style={styles.body}>Trouble signing in?</Text>
            <Link href="/forgot-password" style={styles.link}>Reset your password</Link>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function rank(key: Section['key'], role?: 'buyer' | 'seller' | 'admin') {
  if (role === 'seller') return { sellers: 0, account: 1, safety: 2, buyers: 3 }[key];
  if (role === 'buyer') return { buyers: 0, account: 1, safety: 2, sellers: 3 }[key];
  return { sellers: 0, buyers: 1, account: 2, safety: 3 }[key];
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120, backgroundColor: '#f3f5ed' },
  frame: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 16 },
  contactCard: { flexDirection: 'row', gap: 14, padding: 20, borderRadius: 18, borderWidth: 1, borderColor: '#cfe0cf', backgroundColor: '#eaf3e6', boxShadow: '0 8px 28px rgba(24, 63, 50, 0.08)' },
  contactIcon: { fontSize: 28, lineHeight: 34 },
  contactCopy: { flex: 1, gap: 10 },
  cardTitle: { color: '#183f32', fontSize: 16, fontWeight: '800' },
  body: { color: '#4d5d53', fontSize: 13, lineHeight: 20 },
  primary: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 10, backgroundColor: '#235946' },
  primaryText: { color: '#fffefa', fontSize: 14, fontWeight: '800' },
  email: { color: '#235946', fontSize: 12, fontWeight: '700' },
  section: { gap: 8 },
  sectionTitle: { marginTop: 6, color: '#183f32', fontFamily: 'Georgia', fontSize: 21 },
  card: { paddingHorizontal: 16, paddingVertical: 4, gap: 4, borderRadius: 18, borderWidth: 1, borderColor: '#e3e8de', backgroundColor: '#ffffff', boxShadow: '0 8px 28px rgba(24, 63, 50, 0.08)' },
  item: { paddingVertical: 4 },
  itemDivider: { borderTopWidth: 1, borderTopColor: '#edf0ea' },
  question: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  questionText: { flex: 1, color: '#183f32', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  chevron: { width: 28, height: 28, borderRadius: 14, overflow: 'hidden', textAlign: 'center', lineHeight: 28, color: '#235946', backgroundColor: '#e4eadf', fontSize: 18, fontWeight: '800' },
  answer: { paddingBottom: 12, paddingRight: 40, color: '#4d5d53', fontSize: 13, lineHeight: 20 },
  link: { marginTop: 6, marginBottom: 10, color: '#235946', fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
});
