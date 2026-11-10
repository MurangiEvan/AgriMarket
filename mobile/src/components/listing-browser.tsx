import { Image as ExpoImage } from 'expo-image';
import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import { useAppTheme } from '@/components/app-navigation';
import { ApiError, apiResourceUrl, getCategories, getListings, type Category, type ListingSummary } from '@/lib/api';

const provinces = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
];

export function ListingBrowser({ explore = false }: { explore?: boolean }) {
  const routeParams = useLocalSearchParams<{ q?: string; category?: string; produceTypeId?: string }>();
  const routeQuery = typeof routeParams.q === 'string' ? routeParams.q : '';
  const routeCategory = typeof routeParams.category === 'string' ? routeParams.category : '';
  const routeProduceTypeId = typeof routeParams.produceTypeId === 'string' ? routeParams.produceTypeId : '';
  const { width } = useWindowDimensions();
  const compact = width < 620;
  const { isDark } = useAppTheme();
  const [categories, setCategories] = useState<Category[]>([]);
  const [listings, setListings] = useState<ListingSummary[]>([]);
  const [searchDraft, setSearchDraft] = useState(routeQuery);
  const [query, setQuery] = useState(routeQuery);
  const [category, setCategory] = useState(routeCategory);
  const [produceTypeId, setProduceTypeId] = useState(routeProduceTypeId);
  const [province, setProvince] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [loadedKey, setLoadedKey] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState('');
  const [requestError, setRequestError] = useState<{ key: string; message: string } | null>(null);
  const requestKey = JSON.stringify([query, category, produceTypeId, province, retryCount]);
  const loading = loadedKey !== requestKey;
  const error = requestError?.key === requestKey ? requestError.message : '';
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDraft(routeQuery);
      setQuery(routeQuery);
      setCategory(routeCategory);
      setProduceTypeId(routeProduceTypeId);
    }, 0);
    return () => clearTimeout(timer);
  }, [routeCategory, routeProduceTypeId, routeQuery]);
  useEffect(() => {
    let active = true;
    getCategories()
      .then((result) => active && setCategories(result))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      getListings({ q: query, category, produceTypeId, province })
        .then((result) => {
          if (active) {
            setListings(result.items);
            setNextCursor(result.page.nextCursor);
          }
        })
        .catch((cause: unknown) => {
          if (active) setRequestError({ key: requestKey, message: cause instanceof ApiError ? cause.message : 'Listings could not be loaded.' });
        })
        .finally(() => active && setLoadedKey(requestKey));
    }, 160);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, category, produceTypeId, province, retryCount, requestKey]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError('');
    try {
      const result = await getListings({ q: query, category, produceTypeId, province, cursor: nextCursor });
      setListings((current) => [...current, ...result.items]);
      setNextCursor(result.page.nextCursor);
    } catch (cause) {
      setLoadMoreError(cause instanceof ApiError ? cause.message : 'More listings could not be loaded.');
    } finally {
      setLoadingMore(false);
    }
  }

  const heading = explore ? 'Find a supplier' : 'Source from local suppliers';

  return (
    <ScrollView
      contentContainerStyle={StyleSheet.flatten([styles.page, isDark && styles.pageDark])}
      keyboardShouldPersistTaps="handled"
    >
      <View style={StyleSheet.flatten([styles.frame, isDark && styles.frameDark])}>
        <View style={StyleSheet.flatten([styles.topline, isDark && styles.toplineDark])}>
          <Text style={StyleSheet.flatten([styles.eyebrow, isDark && styles.textDark])}>AGRIMARKET</Text>
        </View>

        <View style={StyleSheet.flatten([styles.hero, compact && styles.heroCompact, isDark && styles.heroDark])}>
          <ExpoImage source={require('@/assets/images/login/market-background.jpg')} contentFit="cover" style={StyleSheet.absoluteFill} accessible={false} />
          <View style={styles.heroShade} />
          <View style={StyleSheet.flatten([styles.heroCopy, compact && styles.heroCopyCompact])}>
            <Text style={styles.heroKicker}>BUY LOCAL, BUY WITH CONFIDENCE</Text>
            <Text accessibilityRole="header" style={StyleSheet.flatten([styles.heroTitle, compact && styles.heroTitleCompact])}>{heading}</Text>
            <Text style={styles.heroDescription}>Meet verified farmers and independent suppliers ready to work with your business.</Text>
          </View>
          {!compact && <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.heroStamp}>
            <Text style={styles.stampNumber}>09</Text>
            <Text style={styles.stampLabel}>PROVINCES</Text>
          </View>}
        </View>

        <View style={StyleSheet.flatten([styles.searchPanel, isDark && styles.searchPanelDark])}>
          <Text style={StyleSheet.flatten([styles.searchLabel, isDark && styles.textDark])}>WHAT DOES YOUR BUSINESS NEED?</Text>
          <View style={styles.searchRow}>
            <TextInput
              accessibilityLabel="Search products, services, or suppliers"
              placeholder="e.g. tomatoes, eggs or tractor hire"
              placeholderTextColor="#7a877f"
              returnKeyType="search"
              value={searchDraft}
              onChangeText={setSearchDraft}
              onSubmitEditing={() => setQuery(searchDraft.trim())}
              style={[styles.searchInput, isDark && styles.searchInputDark]}
            />
            <Pressable accessibilityRole="button" onPress={() => setQuery(searchDraft.trim())} style={[styles.searchButton, isDark && styles.searchButtonDark]}>
              <Text style={styles.searchButtonText}>Ask</Text>
              <Text accessibilityElementsHidden style={styles.searchArrow}>↗</Text>
            </Pressable>
          </View>
          <View style={styles.trustLine}>
            <Text style={[styles.trustTick, isDark && styles.textDark]}>✓</Text>
            <Text style={[styles.trustText, isDark && styles.textDark]}>Verified sellers only</Text>
            <Text style={[styles.trustDivider, isDark && styles.textDark]}>·</Text>
            <Text style={[styles.trustDetail, isDark && styles.textDark]}>Reviewed by our team</Text>
          </View>
        </View>

        <View style={styles.filterSection}>
          <View style={styles.sectionHeadingRow}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Browse categories</Text>
            {category.length > 0 && <Pressable accessibilityRole="button" onPress={() => setCategory('')}><Text style={styles.clearFilter}>Clear</Text></Pressable>}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {categories.map((item) => {
              const selected = category === item.slug;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setCategory(selected ? '' : item.slug)}
                  style={[styles.categoryChip, selected && styles.categoryChipActive]}>
                  <Text style={[styles.categoryMark, selected && styles.categoryTextActive]}>{categoryMark(item.slug)}</Text>
                  <Text style={[styles.categoryText, selected && styles.categoryTextActive]}>{item.name}</Text>
                </Pressable>
              );
            })}
            {categories.length === 0 && <Text style={styles.filterHint}>Categories load when connected.</Text>}
          </ScrollView>
        </View>

        <View style={styles.filterSection}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Choose a province</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.provinces}>
            {provinces.map((item) => {
              const selected = province === item;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setProvince(selected ? '' : item)}
                  style={[styles.provinceChip, selected && styles.provinceChipActive]}>
                  <Text style={[styles.provinceText, selected && styles.categoryTextActive]}>{item}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.listingHeading}>
          <View>
            <Text style={styles.sectionEyebrow}>{query || category || province ? 'MATCHING DIRECTORY' : 'READY TO ENQUIRE'}</Text>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{explore ? 'Supplier directory' : 'Recently published'}</Text>
          </View>
          <Text style={styles.listingCount}>{loading ? '…' : `${listings.length} listed`}</Text>
        </View>

        {loading ? (
          <View accessibilityRole="progressbar" style={styles.stateBox}>
            <ActivityIndicator color="#235946" />
            <Text style={styles.stateText}>Finding verified suppliers…</Text>
          </View>
        ) : error ? (
          <View style={styles.stateBox}>
            <Text accessibilityRole="header" style={styles.stateTitle}>Directory unavailable</Text>
            <Text style={styles.stateText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => setRetryCount((value) => value + 1)} style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : listings.length === 0 ? (
          <View style={styles.stateBox}>
            <Text accessibilityRole="header" style={styles.stateTitle}>No suppliers found</Text>
            <Text style={styles.stateText}>Try another search or clear one of the filters.</Text>
          </View>
        ) : (
          <>
            <View style={styles.listingGrid}>
              {listings.map((listing, index) => <ListingCard key={listing.id} listing={listing} index={index} />)}
            </View>
            {loadMoreError ? <Text accessibilityRole="alert" style={styles.stateText}>{loadMoreError}</Text> : null}
            {nextCursor ? <Pressable accessibilityRole="button" disabled={loadingMore} onPress={loadMore} style={styles.loadMoreButton}><Text style={styles.loadMoreText}>{loadingMore ? 'Loading…' : 'Load more suppliers'}</Text></Pressable> : null}
          </>
        )}
      </View>
    </ScrollView>
  );
}

function ListingCard({ listing, index }: { listing: ListingSummary; index: number }) {
  return (
    <Link href={{ pathname: '/listing', params: { id: listing.id } }} asChild>
      <Pressable accessibilityRole="link" style={StyleSheet.flatten([styles.listingCard, index === 0 && styles.listingCardFeatured])}>
        <View style={[styles.cardArt, index % 2 === 0 ? styles.cardArtGold : styles.cardArtGreen]}>
          {listing.image ? <Image accessibilityLabel={listing.image.altText} source={{ uri: apiResourceUrl(listing.image.url) }} resizeMode="cover" style={styles.cardImage} /> : <Text style={styles.cardArtLetter}>{listing.categoryName.slice(0, 1).toUpperCase()}</Text>}
          <View style={styles.verifiedBadge}><Text style={styles.badgeTick}>✓</Text><Text style={styles.badgeText}>Verified</Text></View>
        </View>
        <View style={styles.cardContent}>
          <Text style={styles.cardCategory}>{listing.categoryName} · {listing.type}</Text>
          <Text numberOfLines={2} style={styles.cardTitle}>{listing.title}</Text>
          <Text numberOfLines={1} style={styles.cardBusiness}>{listing.businessName}</Text>
          <View style={styles.cardFooter}><Text style={styles.cardLocation}>{[listing.town, listing.province].filter(Boolean).join(', ')}</Text><Text style={styles.cardArrow}>↗</Text></View>
        </View>
      </Pressable>
    </Link>
  );
}

function categoryMark(slug: string) {
  const marks: Record<string, string> = {
    vegetables: '✳', fruit: '○', grain: '╱', livestock: '◇', 'processed-foods': '▱', 'agricultural-services': '＋',
  };
  return marks[slug] ?? '·';
}

const styles = StyleSheet.create({
  page: { minHeight: '100%', paddingHorizontal: 20, paddingBottom: 42, backgroundColor: '#f3f5ed' },
  pageDark: { backgroundColor: '#121613' },
  frame: { width: '100%', maxWidth: 1120, alignSelf: 'center' },
  frameDark: { opacity: 1 },
  topline: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toplineDark: { backgroundColor: 'transparent' },
  eyebrow: { color: '#52675a', fontSize: 11, fontWeight: '800' },
  textDark: { color: '#f3f5ed' },
  hero: { minHeight: 215, paddingHorizontal: 26, paddingVertical: 30, borderRadius: 22, backgroundColor: '#183f32', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden', boxShadow: '0 12px 32px rgba(24, 63, 50, 0.22)' },
  heroShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(14, 40, 28, 0.62)' },
  heroDark: { backgroundColor: '#1a2c28' },
  heroCompact: { minHeight: 220, paddingHorizontal: 19, paddingVertical: 25 },
  heroCopy: { maxWidth: 680, gap: 9, flexShrink: 1 },
  heroCopyCompact: { width: '100%', maxWidth: '100%' },
  heroKicker: { color: '#e7b74d', fontSize: 10, fontWeight: '800' },
  heroTitle: { maxWidth: 520, color: '#f3f5ed', fontFamily: 'Georgia', fontSize: 42, lineHeight: 47 },
  heroTitleCompact: { maxWidth: '100%', fontSize: 34, lineHeight: 38 },
  heroDescription: { maxWidth: 420, color: '#d3dfd4', fontSize: 15, lineHeight: 23 },
  heroStamp: { width: 118, height: 118, borderWidth: 1, borderColor: '#658477', borderRadius: 60, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-9deg' }] },
  stampNumber: { color: '#f3f5ed', fontFamily: 'Georgia', fontSize: 36 },
  stampLabel: { color: '#e7b74d', fontSize: 9, fontWeight: '800' },
  searchPanel: { marginTop: 18, padding: 18, borderColor: '#d8ded4', borderWidth: 1, borderRadius: 8, backgroundColor: '#fffefa' },
  searchPanelDark: { backgroundColor: '#1b2a25', borderColor: '#32453d' },
  searchLabel: { marginBottom: 10, color: '#52675a', fontSize: 10, fontWeight: '800' },
  searchRow: { minHeight: 54, flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  searchInput: { flex: 1, minWidth: 0, paddingHorizontal: 14, borderColor: '#cbd5ca', borderWidth: 1, borderRadius: 6, color: '#183f32', fontSize: 15, backgroundColor: '#ffffff' },
  searchInputDark: { backgroundColor: '#0f1715', borderColor: '#3a4d43', color: '#f3f5ed' },
  searchButton: { minWidth: 124, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18, borderRadius: 6, backgroundColor: '#d98a51' },
  searchButtonDark: { backgroundColor: '#ba6c38' },
  searchButtonText: { color: '#fffefa', fontSize: 14, fontWeight: '800' },
  searchArrow: { color: '#fffefa', fontSize: 19 },
  trustLine: { minHeight: 35, paddingTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  trustTick: { color: '#fffefa', backgroundColor: '#3c7159', width: 18, height: 18, borderRadius: 9, textAlign: 'center', fontSize: 12, lineHeight: 18, fontWeight: '800' },
  trustText: { color: '#183f32', fontSize: 12, fontWeight: '700' },
  trustDivider: { color: '#9ca99f' },
  trustDetail: { color: '#65736a', fontSize: 12 },
  filterSection: { marginTop: 27 },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#183f32', fontFamily: 'Georgia', fontSize: 24, lineHeight: 30 },
  clearFilter: { color: '#a7553d', fontSize: 13, fontWeight: '700' },
  chips: { paddingVertical: 13, gap: 9 },
  categoryChip: { minHeight: 48, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8, borderColor: '#d8ded4', borderWidth: 1, borderRadius: 24, backgroundColor: '#fffefa' },
  categoryChipActive: { borderColor: '#183f32', backgroundColor: '#183f32' },
  categoryMark: { color: '#ad7940', fontSize: 18 },
  categoryText: { color: '#364b3e', fontSize: 13, fontWeight: '700' },
  categoryTextActive: { color: '#fffefa' },
  filterHint: { paddingVertical: 15, color: '#78867d', fontSize: 13 },
  provinces: { paddingVertical: 12, gap: 8 },
  provinceChip: { minHeight: 38, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 19, backgroundColor: '#e5e9df' },
  provinceChipActive: { backgroundColor: '#3b7058' },
  provinceText: { color: '#344a3c', fontSize: 12, fontWeight: '700' },
  listingHeading: { marginTop: 23, marginBottom: 14, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  sectionEyebrow: { marginBottom: 4, color: '#a05d3c', fontSize: 9, fontWeight: '800' },
  listingCount: { paddingBottom: 4, color: '#65736a', fontSize: 12, fontWeight: '700' },
  listingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  listingCard: { flexGrow: 1, flexBasis: 260, maxWidth: 360, overflow: 'hidden', borderColor: '#d8ded4', borderWidth: 1, borderRadius: 8, backgroundColor: '#fffefa' },
  listingCardFeatured: { borderColor: '#d4bc83' },
  cardArt: { height: 104, padding: 14, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
  cardArtGold: { backgroundColor: '#e8c977' },
  cardArtGreen: { backgroundColor: '#a6b99b' },
  cardArtLetter: { color: 'rgba(24, 63, 50, 0.35)', fontFamily: 'Georgia', fontSize: 60, lineHeight: 68 },
  verifiedBadge: { paddingHorizontal: 9, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 18, backgroundColor: '#fffefa' },
  badgeTick: { color: '#327251', fontSize: 11, fontWeight: '800' },
  badgeText: { color: '#235946', fontSize: 10, fontWeight: '800' },
  cardContent: { padding: 15 },
  cardCategory: { color: '#a05d3c', fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  cardTitle: { minHeight: 48, marginTop: 6, color: '#183f32', fontFamily: 'Georgia', fontSize: 19, lineHeight: 24 },
  cardBusiness: { marginTop: 5, color: '#52675a', fontSize: 13, fontWeight: '600' },
  cardFooter: { marginTop: 14, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#e2e5dc', flexDirection: 'row', justifyContent: 'space-between' },
  cardLocation: { color: '#65736a', fontSize: 11 },
  cardArrow: { color: '#c37147', fontSize: 16, fontWeight: '700' },
  stateBox: { minHeight: 150, paddingHorizontal: 18, paddingVertical: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#d8ded4', borderRadius: 8, backgroundColor: '#fffefa', gap: 9 },
  stateTitle: { color: '#183f32', fontFamily: 'Georgia', fontSize: 21 },
  stateText: { maxWidth: 440, color: '#65736a', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  retryButton: { minHeight: 40, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 5, backgroundColor: '#183f32' },
  retryText: { color: '#fffefa', fontSize: 13, fontWeight: '700' },
  loadMoreButton: { minHeight: 44, marginTop: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#aab9ab', borderRadius: 5, backgroundColor: '#fffefa' },
  loadMoreText: { color: '#235946', fontSize: 12, fontWeight: '800' },
});