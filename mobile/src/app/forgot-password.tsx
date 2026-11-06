import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, requestPasswordReset } from '@/lib/api';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentMessage, setSentMessage] = useState('');

  async function submit() {
    if (!email.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      setSentMessage(await requestPasswordReset(email.trim()));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The reset email could not be requested. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.brand}>AGRIMARKET</Text>
        <Text accessibilityRole="header" style={styles.title}>Reset your password</Text>
        {sentMessage ? (
          <>
            <Text accessibilityRole="alert" style={styles.success}>{sentMessage}</Text>
            <Text style={styles.body}>Check your inbox and spam folder. The link works once and expires after 30 minutes.</Text>
            <Pressable accessibilityRole="button" onPress={() => setSentMessage('')}>
              <Text style={styles.link}>Send another link</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.body}>Enter the email address for your account and we will send you a link to choose a new password.</Text>
            <Text style={styles.label}>Email</Text>
            <TextInput
              accessibilityLabel="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              returnKeyType="send"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={() => void submit()}
              style={styles.input}
            />
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={busy || !email.trim()}
              onPress={() => void submit()}
              style={[styles.primary, (busy || !email.trim()) && styles.disabled]}
            >
              <Text style={styles.primaryText}>{busy ? 'Sending…' : 'Send reset link'}</Text>
            </Pressable>
          </>
        )}
        <Link href="/sign-in" style={styles.link}>Return to sign in</Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f3f5ed' },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 12, padding: 26, borderRadius: 18, backgroundColor: '#fff' },
  brand: { color: '#235946', fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#183f32', fontSize: 28, fontWeight: '800' },
  body: { color: '#40554a', fontSize: 15, lineHeight: 22 },
  label: { color: '#183f32', fontSize: 14, fontWeight: '700' },
  input: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: '#8a9b8e', borderRadius: 8, color: '#18241d', backgroundColor: '#fff' },
  error: { color: '#a12727', fontSize: 14, lineHeight: 20 },
  success: { color: '#235946', fontSize: 15, fontWeight: '700', lineHeight: 22 },
  primary: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 4, borderRadius: 9, backgroundColor: '#235946' },
  disabled: { opacity: 0.55 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  link: { color: '#235946', fontWeight: '700', textDecorationLine: 'underline' },
});
