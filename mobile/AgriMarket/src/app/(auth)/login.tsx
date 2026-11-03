import React, { useState } from 'react';
import { StyleSheet, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { authService } from '@/services/auth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    try {
      await authService.login(email, password);
      // After login, we can redirect based on role.
      // For now, go to Home.
      router.replace('/');
    } catch (error) {
      alert('Login failed. Please check your credentials.');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={styles.title}>Welcome Back</ThemedText>
          <ThemedText type="small" style={styles.subtitle}>Sign in to your AgriMarket account</ThemedText>
        </ThemedView>

        <ThemedView style={styles.form}>
          <ThemedView style={styles.inputContainer}>
            <ThemedText type="smallBold">Email</ThemedText>
            <ThemedView type="backgroundElement" style={styles.input}>
              <ThemedText style={styles.placeholder}>email@example.com</ThemedText>
            </ThemedView>
          </ThemedView>

          <ThemedView style={styles.inputContainer}>
            <ThemedText type="smallBold">Password</ThemedText>
            <ThemedView type="backgroundElement" style={styles.input}>
              <ThemedText style={styles.placeholder}>••••••••</ThemedText>
            </ThemedView>
          </ThemedView>

          <Pressable onPress={handleLogin} style={styles.loginButton}>
            <ThemedText type="smallBold" style={styles.loginButtonText}>Sign In</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.footer}>
          <ThemedText type="small">Don't have an account? </ThemedText>
          <Pressable onPress={() => router.push('/(auth)/register')}>
            <ThemedText type="linkPrimary" style={styles.link}>Sign Up</ThemedText>
          </Pressable>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.four,
    justifyContent: 'center',
    gap: Spacing.five,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    textAlign: 'center',
    fontSize: 32,
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.7,
  },
  form: {
    gap: Spacing.three,
  },
  inputContainer: {
    gap: Spacing.one,
  },
  input: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    minHeight: 50,
  },
  placeholder: {
    opacity: 0.5,
  },
  loginButton: {
    backgroundColor: '#2E7D32',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.three,
  },
  link: {
    fontWeight: 'bold',
  },
});
