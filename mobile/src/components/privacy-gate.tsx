import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/components/session-provider';
import { ApiError } from '@/lib/api';

// Shown once to accounts created before the Privacy notice existed (or after it changed),
// before they can use the rest of the app.
export function PrivacyGate() {
  const { acceptPrivacy, signOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function accept() {
    setBusy(true);
    setError('');
    try {
      await acceptPrivacy();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save your answer. Check your connection and try again.');
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.card}>
        <Text style={styles.brand}>AGRIMARKET</Text>
        <Text accessibilityRole="header" style={styles.title}>Before you continue</Text>
        <Text style={styles.body}>
          We have published a Privacy notice and Terms of use. They explain what information AgriMarket keeps about you, who can see it, how to delete your account, and the rules for buying and selling.
        </Text>
        <View style={styles.links}>
          <Link href="/privacy" style={styles.link}>Read the Privacy notice</Link>
          <Link href="/terms" style={styles.link}>Read the Terms of use</Link>
        </View>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => void accept()} style={busy ? styles.primaryBusy : styles.primary}>
          <Text style={styles.primaryText}>{busy ? 'Saving…' : 'I accept and continue'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void signOut().catch(() => undefined)} style={styles.secondary}>
          <Text style={styles.secondaryText}>Sign out instead</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f3f5ed' },
  card: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 14, padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#d8ded4', backgroundColor: '#fffefa' },
  brand: { color: '#235946', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#183f32', fontFamily: 'Georgia', fontSize: 28, lineHeight: 34 },
  body: { color: '#364b3e', fontSize: 15, lineHeight: 23 },
  links: { gap: 10 },
  link: { color: '#235946', fontSize: 15, fontWeight: '800', textDecorationLine: 'underline' },
  error: { color: '#a23b32', fontSize: 13, lineHeight: 19 },
  primary: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#183f32' },
  primaryBusy: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#183f32', opacity: 0.5 },
  primaryText: { color: '#fffefa', fontSize: 15, fontWeight: '800' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#526259', fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
});
