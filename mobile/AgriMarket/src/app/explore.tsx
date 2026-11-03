import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';

import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Collapsible } from '@/components/ui/collapsible';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ProductCard, Product } from '@/components/product-card';
import apiClient from '@/services/api';
import { router } from 'expo-router';

export default function TabTwoScreen() {
// ... (state declarations remain same)
  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentInset={insets}
      contentContainerStyle={[styles.contentContainer, contentPlatformStyle]}>
      <ThemedView style={styles.container}>
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="subtitle">Marketplace</ThemedText>
          <ThemedText style={styles.centerText} themeColor="textSecondary">
            Discover fresh produce from local farmers.
          </ThemedText>
        </ThemedView>

        {isLoading ? (
          <ThemedView style={styles.centered}>
            <ActivityIndicator size="large" color="#2E7D32" />
            <ThemedText type="small" style={styles.loadingText}>Loading fresh produce...</ThemedText>
          </ThemedView>
        ) : error ? (
          <ThemedView style={styles.centered}>
            <ThemedText type="small" style={styles.errorText}>{error}</ThemedText>
          </ThemedView>
        ) : (
          <ThemedView style={styles.productsWrapper}>
            <ThemedView style={styles.grid}>
              {products.length > 0 ? (
                products.map((product) => (
                  <Pressable
                    key={product.id}
                    onPress={() => router.push(`/product/${product.id}`)}
                  >
                    <ProductCard product={product} />
                  </Pressable>
                ))
              ) : (
                <ThemedView style={styles.centered}>
                  <ThemedText type="small">No products available at the moment.</ThemedText>
                </ThemedView>
              )}
            </ThemedView>
          </ThemedView>
        )}

        {Platform.OS === 'web' && <WebBadge />}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  container: {
    maxWidth: MaxContentWidth,
    flexGrow: 1,
  },
  titleContainer: {
    gap: Spacing.three,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.six,
  },
  centerText: {
    textAlign: 'center',
  },
  productsWrapper: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.four,
    justifyContent: 'space-between',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
    gap: Spacing.two,
  },
  loadingText: {
    marginTop: Spacing.one,
    textAlign: 'center',
  },
  errorText: {
    textAlign: 'center',
    color: 'red',
  },
});
