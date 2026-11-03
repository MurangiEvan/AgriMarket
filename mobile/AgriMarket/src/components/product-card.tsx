import React from 'react';
import { StyleSheet, Pressable, Image } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export interface Product {
  id: string;
  name: string;
  price: string;
  category: string;
  image: string;
  farmer: string;
}

interface ProductCardProps {
  product: Product;
  onPress?: () => void;
}

export function ProductCard({ product, onPress }: ProductCardProps) {
  return (
    <Pressable onPress={onPress} style={styles.cardWrapper}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <Image
          source={{ uri: product.image }}
          style={styles.image}
          resizeMode="cover"
        />
        <ThemedView style={styles.infoContainer}>
          <ThemedText type="smallBold" style={styles.name}>{product.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.farmer}>
            by {product.farmer}
          </ThemedText>
          <ThemedView style={styles.footer}>
            <ThemedText type="smallBold" style={styles.price}>{product.price}</ThemedText>
            <ThemedView type="backgroundSelected" style={styles.categoryBadge}>
              <ThemedText type="small" style={styles.categoryText}>{product.category}</ThemedText>
            </ThemedView>
          </ThemedView>
        </ThemedView>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    width: '100%',
  },
  card: {
    borderRadius: Spacing.four,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  image: {
    width: '100%',
    height: 120,
    backgroundColor: '#ddd',
  },
  infoContainer: {
    padding: Spacing.three,
    gap: Spacing.one,
  },
  name: {
    fontSize: 16,
  },
  farmer: {
    fontSize: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  price: {
    fontSize: 16,
    color: '#2E7D32', // Agriculture Green
  },
  categoryBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  categoryText: {
    fontSize: 10,
  },
});
