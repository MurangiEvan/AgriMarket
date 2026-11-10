import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { ApiError, confirmPasswordReset } from '@/lib/api';

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [doneMessage, setDoneMessage] = useState('');

  const mismatch = confirmation.length > 0 && password !== confirmation;
  const tooShort = password.length > 0 && password.length < 10;
  const canSubmit = Boolean(token) && password.length >= 10 && password === confirmation && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      setDoneMessage(await confirmPasswordReset(token, password));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Your password could not be reset. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <BackButton fallback="/sign-in" />
        <Text style={styles.brand}>AGRIMARKET</Text>
        <Text accessibilityRole="header" style={styles.title}>Choose a new password</Text>
        {doneMessage ? (
          <>
            <Text accessibilityRole="alert" style={styles.success}>{doneMessage}</Text>
            <Text style={styles.body}>For your security, you have been signed out on all devices.</Text>
            <Link href="/sign-in" style={styles.link}>Go to sign in</Link>
          </>
        ) : !token ? (
          <>
            <Text accessibilityRole="alert" style={styles.error}>This reset link is incomplete. Open the link from your email again, or request a new one.</Text>
            <Link href="/forgot-password" style={styles.link}>Request a new reset link</Link>
          </>
        ) : (
          <>
            <Text style={styles.label}>New password</Text>
            <TextInput
              accessibilityLabel="New password"
              placeholder="At least 10 characters"
              placeholderTextColor="#7a877f"
              autoComplete="new-password"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={styles.input}
            />
            <Text style={styles.label}>Confirm new password</Text>
            <TextInput
              accessibilityLabel="Confirm new password"
              placeholder="Type the new password again"
              placeholderTextColor="#7a877f"
              autoComplete="new-password"
              secureTextEntry
              returnKeyType="done"
              value={confirmation}
              onChangeText={setConfirmation}
              onSubmitEditing={() => void submit()}
              style={styles.input}
            />
            <Text style={tooShort || mismatch ? styles.error : styles.helper}>
              {mismatch ? 'The passwords do not match.' : 'Use at least 10 characters.'}
            </Text>
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={!canSubmit}
              onPress={() => void submit()}
              style={[styles.primary, !canSubmit && styles.disabled]}
            >
              <Text style={styles.primaryText}>{busy ? 'Saving…' : 'Save new password'}</Text>
            </Pressable>
            <Link href="/forgot-password" style={styles.link}>Request a new reset link</Link>
          </>
        )}
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
  helper: { color: '#526259', fontSize: 13, lineHeight: 19 },
  error: { color: '#a12727', fontSize: 14, lineHeight: 20 },
  success: { color: '#235946', fontSize: 15, fontWeight: '700', lineHeight: 22 },
  primary: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 4, borderRadius: 9, backgroundColor: '#235946' },
  disabled: { opacity: 0.55 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  link: { color: '#235946', fontWeight: '700', textDecorationLine: 'underline' },
});
