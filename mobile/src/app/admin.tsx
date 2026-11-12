import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { greeting, PageHero } from '@/components/page-hero';
import { useSession } from '@/components/session-provider';

// Administration now lives on its own website (Next.js on Vercel), which uses this same API.
const ADMIN_WEBSITE_URL = process.env.EXPO_PUBLIC_ADMIN_URL?.replace(/\/$/, '') ?? '';

export default function AdminScreen() {
  const { user, signOut } = useSession();

  if (user?.role !== 'admin') {
    return <View style={styles.denied}><Text accessibilityRole="header" style={styles.title}>Administrator access required</Text><Text style={styles.body}>Admin permissions are assigned through the protected operational bootstrap, never public registration.</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.frame}>
        <PageHero eyebrow="AUTHORIZED STAFF" title={greeting()} subtitle="Seller verifications and produce photos are now reviewed on the AgriMarket admin website." />
        <View style={styles.panel}>
          <Text accessibilityRole="header" style={styles.panelTitle}>Use the admin website</Text>
          <Text style={styles.body}>
            The review queue, document viewer, photo approvals and audit log have moved to a dedicated website for administrators. Sign in there with this same email and password.
          </Text>
          {ADMIN_WEBSITE_URL ? (
            <>
              <Pressable accessibilityRole="link" accessibilityLabel="Open the admin website" onPress={() => void Linking.openURL(ADMIN_WEBSITE_URL)} style={styles.primary}>
                <Text style={styles.primaryText}>Open the admin website</Text>
              </Pressable>
              <Text selectable style={styles.url}>{ADMIN_WEBSITE_URL}</Text>
            </>
          ) : (
            <Text style={styles.body}>Ask the project lead for the admin website address.</Text>
          )}
          <Pressable accessibilityRole="button" onPress={() => void signOut().catch(() => undefined)} style={styles.secondary}>
            <Text style={styles.secondaryText}>Sign out of the app</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120, backgroundColor: '#f3f5ed' },
  frame: { width: '100%', maxWidth: 920, alignSelf: 'center', gap: 14 },
  denied: { flex: 1, minHeight: 320, padding: 24, justifyContent: 'center', gap: 12, backgroundColor: '#f3f5ed' },
  title: { color: '#183f32', fontFamily: 'Georgia', fontSize: 32 },
  body: { color: '#65736a', fontSize: 13, lineHeight: 20 },
  panel: { padding: 20, gap: 14, borderColor: '#e3e8de', borderWidth: 1, borderRadius: 18, backgroundColor: '#ffffff', boxShadow: '0 8px 28px rgba(24, 63, 50, 0.08)' },
  panelTitle: { color: '#183f32', fontSize: 16, fontWeight: '800' },
  primary: { minHeight: 46, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#235946' },
  primaryText: { color: '#fffefa', fontSize: 14, fontWeight: '800' },
  url: { color: '#235946', fontSize: 12, textAlign: 'center' },
  secondary: { minHeight: 42, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#cbd5ca' },
  secondaryText: { color: '#235946', fontSize: 13, fontWeight: '800' },
});
