import React, { useEffect, useState } from 'react';
import { StyleSheet, Pressable, View, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import apiClient from '@/services/api';
import { ProductCard, Product } from '@/components/product-card';

interface Listing extends Product {
  status: 'draft' | 'pending' | 'published' | 'rejected';
}

export default function SellerDashboard() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchListings() {
      try {
        setIsLoading(true);
        const response = await apiClient.get('/seller/listings');
        setListings(response.data.data || response.data);
      } catch (err) {
        console.error('Failed to fetch listings:', err);
        setError('Unable to load your listings.');
      } finally {
        setIsLoading(false);
      }
    }

    fetchListings();
  }, []);

  const handleSubmit = async (listingId: string) => {
    try {
      await apiClient.post(`/seller/listings/${listingId}/submit`);
      Alert.alert('Success', 'Listing submitted for review!');
      // Refresh list
      const response = await apiClient.get('/seller/listings');
      setListings(response.data.data || response.data);
    } catch (err) {
      Alert.alert('Error', 'Failed to submit listing.');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.header}>
        <ThemedText type="subtitle">Seller Dashboard</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Manage your agricultural produce and orders
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.statsGrid}>
        <ThemedView type="backgroundElement" style={styles.statCard}>
          <ThemedText type="small">Active Listings</ThemedText>
          <ThemedText type="title" style={styles.statValue}>
            {listings.filter(l => l.status === 'published').length}
          </ThemedText>
        </ThemedView>
        <ThemedView type="backgroundElement" style={styles.statCard}>
          <ThemedText type="small">Drafts</ThemedText>
          <ThemedText type="title" style={styles.statValue}>
            {listings.filter(l => l.status === 'draft').length}
          </ThemedText>
        </ThemedView>
      </ThemedView>

      <ThemedView style={styles.actions}>
        <Pressable
          style={styles.actionButton}
          onPress={() => router.push('/seller/add-product')}
        >
          <ThemedText type="smallBold" style={styles.actionButtonText}>+ Add New Product</ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedText type="smallBold" style={styles.sectionTitle}>Your Listings</ThemedText>

      {isLoading ? (
        <ThemedView style={styles.centered}>
          <ActivityIndicator size="large" color="#2E7D32" />
        </ThemedView>
      ) : error ? (
        <ThemedView style={styles.centered}>
          <ThemedText type="small" style={styles.errorText}>{error}</ThemedText>
        </ThemedView>
      ) : listings.length === 0 ? (
        <ThemedView style={styles.emptyState}>
          <ThemedText type="small">You haven't listed any products yet.</ThemedText>
        </ThemedView>
      ) : (
        <ThemedView style={styles.listingsGrid}>
          {listings.map((listing) => (
            <ThemedView key={listing.id} style={styles.listingItem}>
              <ProductCard product={listing} />
              {listing.status === 'draft' && (
                <Pressable
                  style={styles.submitButton}
                  onPress={() => handleSubmit(listing.id)}
                >
                  <ThemedText type="smallBold" style={styles.submitButtonText}>Submit for Review</ThemedText>
                </Pressable>
              )}
              <ThemedText type="small" style={styles.statusText}>
                Status: {listing.status}
              </ThemedText>
            </ThemedView>
          ))}
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.four,
  },
  header: {
    gap: Spacing.one,
    marginBottom: Spacing.five,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginBottom: Spacing.five,
  },
  statCard: {
    flex: 1,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
    gap: Spacing.one,
  },
  statValue: {
    fontSize: 24,
    textAlign: 'center',
  },
  actions: {
    marginBottom: Spacing.five,
  },
  actionButton: {
    backgroundColor: '#2E7D32',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
  },
  sectionTitle: {
    marginBottom: Spacing.three,
  },
  listingsGrid: {
    gap: Spacing.four,
  },
  listingItem: {
    gap: Spacing.two,
    paddingBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  submitButton: {
    backgroundColor: '#C8E6C9',
    padding: Spacing.two,
    borderRadius: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  submitButtonText: {
    color: '#2E7D32',
    fontSize: 14,
  },
  statusText: {
    fontSize: 12,
    opacity: 0.6,
    textAlign: 'right',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
    gap: Spacing.two,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.6,
  },
  errorText: {
    textAlign: 'center',
    color: 'red',
  },
});
