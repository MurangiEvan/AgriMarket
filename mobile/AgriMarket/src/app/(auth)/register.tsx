import React, { useState } from 'react';
import { StyleSheet, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { authService, UserRole } from '@/services/auth';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('buyer');

  const handleRegister = async () => {
    try {
      await authService.register(email, password, role);
      router.replace('/(auth)/login');
    } catch (error) {
      alert('Registration failed. Please try again.');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={styles.title}>Create Account</ThemedText>
          <ThemedText type="small" style={styles.subtitle}>Join the AgriMarket community</ThemedText>
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

          <ThemedView style={styles.roleSection}>
            <ThemedText type="smallBold" style={styles.roleTitle}>I am a:</ThemedText>
            <ThemedView style={styles.roleContainer}>
              <Pressable
                onPress={() => setRole('buyer')}
                style={[styles.roleButton, role === 'buyer' && styles.roleButtonSelected]}
              >
                <ThemedText type="small">{role === 'buyer' ? '✅ Buyer' : 'Buyer'}</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => setRole('seller')}
                style={[styles.roleButton, role === 'seller' && styles.roleButtonSelected]}
              >
                <ThemedText type="small">{role === 'seller' ? '✅ Seller' : 'Seller'}</ThemedText>
              </Pressable>
            </ThemedView>
          </ThemedView>

          <Pressable onPress={handleRegister} style={styles.registerButton}>
            <ThemedText type="smallBold" style={styles.registerButtonText}>Create Account</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.footer}>
          <ThemedText type="small">Already have an account? </ThemedText>
          <Pressable onPress={() => router.push('/(auth)/login')}>
            <ThemedText type="linkPrimary" style={styles.link}>Sign In</ThemedText>
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
  roleSection: {
    gap: Spacing.one,
  },
  roleTitle: {
    marginBottom: Spacing.one,
  },
  roleContainer: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  roleButton: {
    flex: 1,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  roleButtonSelected: {
    borderColor: '#2E7D32',
    backgroundColor: 'rgba(46, 125, 50, 0.1)',
  },
  registerButton: {
    backgroundColor: '#2E7D32',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  registerButtonText: {
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
