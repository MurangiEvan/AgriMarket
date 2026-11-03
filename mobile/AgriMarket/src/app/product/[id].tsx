import React, { useEffect, useState } from 'react';
import { StyleSheet, Pressable, ScrollView, View, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import apiClient from '@/services/api';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [product, setProduct] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchProduct() {
      try {
        const response = await apiClient.get(`/listings/${id}`);
        setProduct(response.data);
      } catch (error) {
        Alert.alert('Error', 'Could not load product details.');
        router.back();
      } finally {
        setIsLoading(false);
      }
    }
    fetchProduct();
  }, [id]);

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Loading product...</ThemedText>
      </ThemedView>
    );
  }

  if (!product) return null;

  return (
    <ScrollView style={styles.container}>
      <ThemedView style={styles.imageContainer}>
        {/* Placeholder for image - in real app we'd use the product image URL */}
        <ThemedView style={styles.imagePlaceholder}>
          <ThemedText>Product Image</ThemedText>
        </ThemedView>
      </ThemedView>

      <ThemedView style={styles.content}>
        <ThemedText type="subtitle">{product.name}</ThemedText>
        <ThemedText type="smallBold" style={styles.price}>{product.price}</ThemedText>

        <ThemedView style={styles.divider} />

        <ThemedText type="smallBold">About this product</ThemedText>
        <ThemedText type="small" style={styles.description}>
          {product.description || 'No description provided by the seller.'}
        </ThemedText>

        <ThemedView style={styles.farmerSection}>
          <ThemedText type="smallBold">Seller: {product.business?.name || 'Local Farmer'}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Location: {product.province}
          </ThemedText>
        </ThemedView>

        <Pressable
          style={styles.contactButton}
          onPress={() => {
            Alert.alert('Enquiry', 'Sending enquiry to farmer...');
            // API call to /enquiries would go here
          }}
        >
          <ThemedText type="smallBold" style={styles.contactButtonText}>Contact Farmer</ThemedText>
        </Pressable>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    width: '100%',
    height: 300,
    backgroundColor: '#ddd',
  },
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  price: {
    fontSize: 24,
    color: '#2E7D32',
    marginVertical: Spacing.two,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginVertical: Spacing.two,
  },
  description: {
    marginVertical: Spacing.two,
    lineHeight: 22,
  },
  farmerSection: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    backgroundColor: 'rgba(0,0,0,0.05)',
    gap: Spacing.one,
  },
  contactButton: {
    backgroundColor: '#2E7D32',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.four,
  },
  contactButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
  },
});
