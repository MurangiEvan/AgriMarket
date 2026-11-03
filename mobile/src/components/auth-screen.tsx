import { Link } from 'expo-router';
import { useRef, useState, type ElementRef } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '@/lib/api';
import { useSession } from '@/components/session-provider';

export function AuthScreen({ registration = false }: { registration?: boolean }) {
  const { signIn, register, error: sessionError } = useSession();
  const [role, setRole] = useState<'buyer' | 'seller'>('buyer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState<'email' | 'password' | null>(null);
  const passwordInput = useRef<ElementRef<typeof TextInput>>(null);

  async function submit() {
    if (busy) return;
    Keyboard.dismiss();
    setBusy(true);
    setError('');
    try {
      if (registration) await register(email.trim(), password, role);
      else await signIn(email.trim(), password);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Your account request could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  const visibleError = error || sessionError;
  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.brand}>AGRIMARKET</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {registration ? 'Create your account' : 'Welcome to AgriMarket'}
        </Text>
        <Text style={styles.description}>
          {registration ? 'Join as a buyer or seller to connect through local produce.' : 'Sign in to discover verified farmers and suppliers.'}
        </Text>
        {registration ? (
          <View style={styles.roles}>
            {(['buyer', 'seller'] as const).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="radio"
                accessibilityState={{ checked: role === item }}
                onPress={() => setRole(item)}
                style={[styles.roleButton, role === item && styles.roleSelected]}
              >
                <Text style={[styles.roleText, role === item && styles.roleTextSelected]}>
                  {item === 'buyer' ? 'Buyer' : 'Seller'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text nativeID="auth-email-label" style={styles.label}>Email</Text>
        <TextInput
          accessibilityLabel="Email"
          accessibilityLabelledBy={Platform.select({ android: 'auth-email-label', default: undefined })}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType="next"
          value={email}
          onChangeText={setEmail}
          onFocus={() => setFocusedField('email')}
          onBlur={() => setFocusedField(null)}
          onSubmitEditing={() => passwordInput.current?.focus()}
          style={[styles.input, focusedField === 'email' && styles.inputFocused]}
        />
        <Text nativeID="auth-password-label" style={styles.label}>Password</Text>
        <TextInput
          ref={passwordInput}
          accessibilityLabel="Password"
          accessibilityLabelledBy={Platform.select({ android: 'auth-password-label', default: undefined })}
          autoComplete={registration ? 'new-password' : 'current-password'}
          secureTextEntry
          returnKeyType="done"
          value={password}
          onChangeText={setPassword}
          onFocus={() => setFocusedField('password')}
          onBlur={() => setFocusedField(null)}
          onSubmitEditing={() => void submit()}
          style={[styles.input, focusedField === 'password' && styles.inputFocused]}
        />
        {registration ? <Text style={styles.helper}>Use at least 10 characters. Email delivery is not configured, so confirmation messages are not sent.</Text> : null}
        {visibleError ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{visibleError}</Text> : null}
        <Pressable
          accessibilityRole="button"
          disabled={busy || !email.trim() || !password}
          onPress={() => void submit()}
          style={[styles.primary, (busy || !email.trim() || !password) && styles.disabled]}
        >
          <Text style={styles.primaryText}>{busy ? 'Please wait…' : registration ? 'Create account' : 'Sign in'}</Text>
        </Pressable>
        <View style={styles.links}>
          {registration ? (
            <Link href="/sign-in" style={styles.link}>Already have an account? Sign in</Link>
          ) : (
            <>
              <Link href="/sign-up" style={styles.link}>Create an account</Link>
              <Link href="/forgot-password" style={styles.link}>Forgot password?</Link>
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f3f5ed' },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 12, padding: 26, borderRadius: 18, backgroundColor: '#ffffff' },
  brand: { color: '#235946', fontSize: 13, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#183f32', fontSize: 30, fontWeight: '800' },
  description: { marginBottom: 8, color: '#526259', fontSize: 15, lineHeight: 22 },
  label: { color: '#183f32', fontSize: 14, fontWeight: '700' },
  input: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: '#8a9b8e', borderRadius: 8, color: '#18241d', backgroundColor: '#fff' },
  inputFocused: { borderWidth: 2, borderColor: '#235946' },
  roles: { flexDirection: 'row', gap: 8, marginVertical: 6 },
  roleButton: { flex: 1, alignItems: 'center', padding: 12, borderWidth: 1, borderColor: '#aab6ab', borderRadius: 8 },
  roleSelected: { borderColor: '#235946', backgroundColor: '#e4eadf' },
  roleText: { color: '#40554a', fontWeight: '700' },
  roleTextSelected: { color: '#183f32' },
  helper: { color: '#526259', fontSize: 13, lineHeight: 19 },
  error: { color: '#a12727', fontSize: 14, lineHeight: 20 },
  primary: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 4, borderRadius: 9, backgroundColor: '#235946' },
  disabled: { opacity: 0.55 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14, marginTop: 6 },
  link: { color: '#235946', fontWeight: '700', textDecorationLine: 'underline' },
});
