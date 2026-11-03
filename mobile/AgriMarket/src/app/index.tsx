import * as Device from 'expo-device';
import { Platform, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { HintRow } from '@/components/hint-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

function getDevMenuHint() {
  if (Platform.OS === 'web') {
    return <ThemedText type="small">use browser devtools</ThemedText>;
  }
  if (Device.isDevice) {
    return (
      <ThemedText type="small">
        shake device or press <ThemedText type="code">m</ThemedText> in terminal
      </ThemedText>
    );
  }
  const shortcut = Platform.OS === 'android' ? 'cmd+m (or ctrl+m)' : 'cmd+d';
  return (
    <ThemedText type="small">
      press <ThemedText type="code">{shortcut}</ThemedText>
    </ThemedText>
  );
}

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <AnimatedIcon />
          <ThemedText type="title" style={styles.title}>
            AgriMarket
          </ThemedText>
          <ThemedText type="small" style={styles.subtitle}>
            Connecting Farmers & Buyers Directly
          </ThemedText>
        </ThemedView>

        <ThemedView style={styles.searchSection}>
          <ThemedView type="backgroundElement" style={styles.searchBar}>
            <ThemedText type="small" style={styles.searchPlaceholder}>
              Search for fresh produce...
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.categorySection}>
          <ThemedText type="smallBold" style={styles.sectionTitle}>Featured Categories</ThemedText>
          <ThemedView style={styles.categoryGrid}>
            {['Vegetables', 'Fruits', 'Grains', 'Organic'].map((cat) => (
              <ThemedView key={cat} type="backgroundElement" style={styles.categoryCard}>
                <ThemedText type="small">{cat}</ThemedText>
              </ThemedView>
            ))}
          </ThemedView>
        </ThemedView>

        {Platform.OS === 'web' && <WebBadge />}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  title: {
    textAlign: 'center',
    fontSize: 32,
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.8,
  },
  searchSection: {
    width: '100%',
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  searchBar: {
    width: '100%',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  searchPlaceholder: {
    opacity: 0.6,
  },
  categorySection: {
    width: '100%',
    gap: Spacing.two,
  },
  sectionTitle: {
    marginBottom: Spacing.two,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    justifyContent: 'center',
  },
  categoryCard: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
});
