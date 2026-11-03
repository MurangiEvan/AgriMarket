import React, { useState } from 'react';
import { StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import apiClient from '@/services/api';

export default function AddProductScreen() {
  const [form, setForm] = useState({
    name: '',
    price: '',
    category: '',
    description: '',
    province: '',
  });

  const handleSave = async () => {
    if (!form.name || !form.price || !form.category) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      await apiClient.post('/seller/listings', form);
      Alert.alert('Success', 'Product listing created as a draft!');
      router.replace('/seller');
    } catch (error) {
      console.error('Save failed:', error);
      Alert.alert('Error', 'Failed to save listing. Please try again.');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.header}>
          <ThemedText type="title" style={styles.title}>List New Product</ThemedText>
          <ThemedText type="small" style={styles.subtitle}>Provide details to reach more buyers</ThemedText>
        </ThemedView>

        <ThemedView style={styles.form}>
          <ThemedView style={styles.inputContainer}>
            <ThemedText type="smallBold">Product Name *</ThemedText>
            <ThemedView type="backgroundElement" style={styles.input}>
              <ThemedText style={styles.placeholder}>e.g. Organic Fuji Apples</ThemedText>
            </ThemedView>
          </ThemedView>

          <ThemedView style={styles.inputContainer}>
            <ThemedText type="smallBold">Price (e.g. $2.00/kg) *</ThemedText>
            <ThemedView type="backgroundElement" style={styles.input}>
              <ThemedText style={styles.placeholder}>$0.00/unit</ThemedText>
            </ThemedView>
          </ThemedView>

          <ThemedView style={styles.inputContainer}>
            <ThemedText type="smallBold">Category *</ThemedText>
            <ThemedView type="backgroundElement" style={styles.input}>
              <ThemedText style={styles.placeholder}>e.g. Vegetables</ThemedText>
            </ThemedView>
          </ThemedView>

          <ThemedView style={styles.inputContainer}>
            <ThemedText type="smallBold">Province *</ThemedText>
            <ThemedView type="backgroundElement" style={styles.input}>
              <ThemedText style={styles.placeholder}>Select your province</ThemedText>
            </ThemedView>
          </ThemedView>

          <ThemedView style={styles.inputContainer}>
            <ThemedText type="smallBold">Description</ThemedText>
            <ThemedView type="backgroundElement" style={[styles.input, styles.textArea]}>
              <ThemedText style={styles.placeholder}>Describe the quality, harvest date, etc.</ThemedText>
            </ThemedView>
          </ThemedView>

          <ThemedView style={styles.buttonGroup}>
            <Pressable onPress={handleSave} style={styles.saveButton}>
              <ThemedText type="smallBold" style={styles.saveButtonText}>Create Listing</ThemedText>
            </Pressable>
            <Pressable onPress={() => router.back()} style={styles.cancelButton}>
              <ThemedText type="small">Cancel</ThemedText>
            </Pressable>
          </ThemedView>
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
    gap: Spacing.five,
  },
  header: {
    gap: Spacing.one,
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 28,
  },
  subtitle: {
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
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  placeholder: {
    opacity: 0.5,
  },
  buttonGroup: {
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
  saveButton: {
    backgroundColor: '#2E7D32',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },
  cancelButton: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
  },
});
