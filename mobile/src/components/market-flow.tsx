import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';

import {
  ApiError,
  getBuyerLocation,
  getMarketCategories,
  getMarketProduce,
  saveBuyerLocation,
  searchBuyerLocations,
  type BuyerLocation,
  type Category,
  type LocationCandidate,
  type MarketProduce,
} from '@/lib/api';
import {
  changeMarketRadius,
  continueMarketFlow,
  filterAndSortProduce,
  haversineDistanceKm,
  resolveMarketOrigin,
  type ResolvedMarketOrigin,
  type MarketFlowState,
} from '@/lib/market-flow';
import { DEFAULT_RADIUS_KM, RADIUS_OPTIONS_KM, radiusOptionLabel } from '@/constants/market';
import { categoryColor, categoryIcon, produceIcon } from '@/constants/produce-icons';

type DeviceLocation = { latitude: number; longitude: number };
type DeviceLocationResult = { location: DeviceLocation | null; status: 'granted' | 'prompt' | 'denied' | 'unsupported' | 'timeout' | 'unavailable' };
type MarketOrigin = ResolvedMarketOrigin;

const radiusStorageKey = 'agrimarket.market.radius';

export function MarketFlow() {
  const { width } = useWindowDimensions();
  const compact = width < 620;
  const [flow, setFlow] = useState<MarketFlowState>({
    radiusKm: DEFAULT_RADIUS_KM,
    categoryId: '',
    categorySlug: '',
    searchText: '',
    query: '',
    screen: 'radius',
  });
  const [radiusMenuOpen, setRadiusMenuOpen] = useState(false);
  const [radiusError, setRadiusError] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState('');
  const [produce, setProduce] = useState<MarketProduce[]>([]);
  const [produceLoading, setProduceLoading] = useState(false);
  const [produceError, setProduceError] = useState('');
  const [produceRetryCount, setProduceRetryCount] = useState(0);
  const [origin, setOrigin] = useState<MarketOrigin | null>(null);
  const [savedLocation, setSavedLocation] = useState<BuyerLocation | null>(null);
  const savedLocationRef = useRef<BuyerLocation | null>(null);
  const [gpsLocation, setGpsLocation] = useState<DeviceLocation | null>(null);
  const [gpsStatus, setGpsStatus] = useState<DeviceLocationResult['status']>('unavailable');
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState('');
  const [locationEditorOpen, setLocationEditorOpen] = useState(false);
  const [locationSearchText, setLocationSearchText] = useState('');
  const [locationCandidates, setLocationCandidates] = useState<LocationCandidate[]>([]);
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [locationSearchError, setLocationSearchError] = useState('');
  const [locationAttribution, setLocationAttribution] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);
  const visibleProduce = useMemo(() => filterAndSortProduce(produce, flow.query), [produce, flow.query]);

  const refreshLocations = useCallback(async () => {
    setLocationLoading(true);
    setLocationError('');
    const [savedResult, gpsResult] = await Promise.allSettled([getBuyerLocation(), getDeviceLocation()]);

    const saved = savedResult.status === 'fulfilled' ? savedResult.value.location : savedLocationRef.current;
    if (savedResult.status === 'fulfilled') {
      savedLocationRef.current = saved;
      setSavedLocation(saved);
    }
    else setLocationError(savedResult.reason instanceof ApiError ? savedResult.reason.message : 'Your saved location could not be loaded.');

    if (gpsResult.status === 'fulfilled') {
      setGpsStatus(gpsResult.value.status);
      setGpsLocation(gpsResult.value.location);
      setOrigin(resolveMarketOrigin(gpsResult.value.location, saved));
    } else {
      setGpsStatus('unavailable');
      setGpsLocation(null);
      setOrigin(resolveMarketOrigin(null, saved));
      setLocationError(gpsResult.reason instanceof Error ? gpsResult.reason.message : 'Your location could not be checked.');
    }
    setLocationLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    const locationTimer = setTimeout(() => {
      if (active) void refreshLocations();
    }, 0);
    AsyncStorage.getItem(radiusStorageKey)
      .then((value) => {
        if (!active || !value) return;
        const radius = Number(value);
        if (RADIUS_OPTIONS_KM.some((option) => option === radius)) {
          setFlow((current) => ({ ...current, radiusKm: radius }));
        }
      })
      .catch(() => active && setRadiusError('Your saved radius preference could not be loaded.'));
    return () => {
      active = false;
      clearTimeout(locationTimer);
    };
  }, [refreshLocations]);

  useEffect(() => {
    let active = true;
    getMarketCategories()
      .then((result) => active && setCategories(result))
      .catch((cause: unknown) => active && setCategoriesError(cause instanceof ApiError ? cause.message : 'Categories could not be loaded.'))
      .finally(() => active && setCategoriesLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let wasBackgrounded = false;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'inactive' || state === 'background') wasBackgrounded = true;
      if (state === 'active' && wasBackgrounded) {
        wasBackgrounded = false;
        void refreshLocations();
      }
    });
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshLocations();
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    return () => {
      subscription.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [refreshLocations]);

  useEffect(() => {
    if (flow.screen !== 'produce' || !flow.categoryId || !origin) return;
    let active = true;
    const timer = setTimeout(() => {
      setProduceLoading(true);
      setProduceError('');
      getMarketProduce({
        categoryId: flow.categoryId,
        radiusKm: flow.radiusKm,
        latitude: origin.latitude,
        longitude: origin.longitude,
        q: flow.query,
      })
        .then((result) => active && setProduce(result))
        .catch((cause: unknown) => {
          if (active) setProduceError(cause instanceof ApiError ? cause.message : 'Produce could not be loaded.');
        })
        .finally(() => active && setProduceLoading(false));
    }, 140);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [flow.categoryId, flow.query, flow.radiusKm, flow.screen, origin, produceRetryCount]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFlow((current) => {
        const query = current.searchText.trim();
        return current.query === query ? current : { ...current, query };
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [flow.searchText]);

  async function selectRadius(radiusKm: number) {
    setFlow((current) => ({ ...current, radiusKm }));
    setRadiusMenuOpen(false);
    setRadiusError('');
    try {
      await AsyncStorage.setItem(radiusStorageKey, String(radiusKm));
    } catch {
      setRadiusError('The selected radius will be used now, but could not be saved for next time.');
    }
  }

  async function refreshCurrentLocation() {
    setLocationLoading(true);
    setLocationError('');
    try {
      const result = await getDeviceLocation(true);
      setGpsStatus(result.status);
      setGpsLocation(result.location);
      if (!result.location) {
        if (savedLocation) {
          setOrigin(resolveMarketOrigin(null, savedLocation, 'saved'));
        } else {
          setOrigin(null);
          setLocationEditorOpen(true);
        }
        return;
      }
      setOrigin(resolveMarketOrigin(result.location, savedLocation, 'current'));
    } catch (cause) {
      setLocationError(cause instanceof Error ? cause.message : 'Your current location could not be updated.');
    } finally {
      setLocationLoading(false);
    }
  }

  function useSavedLocation() {
    if (!savedLocation) {
      setLocationEditorOpen(true);
      return;
    }
    setOrigin(resolveMarketOrigin(gpsLocation, savedLocation, 'saved'));
    setLocationError('');
  }

  async function searchLocation() {
    const query = locationSearchText.trim();
    if (query.length < 2) {
      setLocationSearchError('Enter a town, suburb, or area to search.');
      return;
    }
    setLocationSearchLoading(true);
    setLocationSearchError('');
    try {
      const result = await searchBuyerLocations(query);
      setLocationCandidates(result.locations);
      setLocationAttribution(result.attribution ?? '');
      if (result.locations.length === 0) setLocationSearchError('No matching places found. Try a nearby town or suburb.');
    } catch (cause) {
      setLocationSearchError(cause instanceof ApiError ? cause.message : 'Location search could not be completed.');
    } finally {
      setLocationSearchLoading(false);
    }
  }

  async function chooseSavedLocation(candidate: LocationCandidate) {
    setSavingLocation(true);
    setLocationSearchError('');
    try {
      const result = await saveBuyerLocation(candidate);
      savedLocationRef.current = result.location;
      setSavedLocation(result.location);
      setOrigin(resolveMarketOrigin(gpsLocation, result.location, 'saved'));
      setLocationEditorOpen(false);
      setLocationCandidates([]);
      setLocationSearchText('');
      setLocationError('');
    } catch (cause) {
      setLocationSearchError(cause instanceof ApiError ? cause.message : 'Your location could not be saved.');
    } finally {
      setSavingLocation(false);
    }
  }

  function chooseCategory(category: Category) {
    setFlow((current) => ({
      ...current,
      categoryId: category.id,
      categorySlug: category.slug,
      screen: 'produce',
    }));
  }

  function openListingResults(item: MarketProduce) {
    if (!flow.categorySlug) return;
    router.push({ pathname: '/explore', params: { category: flow.categorySlug, produceTypeId: item.id } });
  }

  const farFromSaved =
    origin?.source === 'current' &&
    savedLocation !== null &&
    gpsLocation !== null &&
    haversineDistanceKm(gpsLocation, savedLocation) > 50;

  return (
    <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={[styles.frame, compact && styles.frameCompact]}>
        <Text style={styles.eyebrow}>AGRIMARKET · NEARBY MARKET</Text>
        {flow.screen === 'radius' ? (
          <View style={styles.panel}>
            <Text accessibilityRole="header" style={styles.title}>Find produce near you</Text>
            <Text style={styles.description}>Choose how far you’re willing to source. Your live location is used only for this session.</Text>
            <Text style={styles.permissionNotice}>Choose “Use my current location” to find nearby produce, or set a saved area instead.</Text>
            <LocationChip origin={origin} loading={locationLoading} onChange={() => setLocationEditorOpen((open) => !open)} />
            <LocationActions
              onUseCurrent={() => void refreshCurrentLocation()}
              onUseSaved={useSavedLocation}
              savedLocation={savedLocation}
              loading={locationLoading}
            />
            {locationError ? <Text accessibilityRole="alert" style={styles.error}>{locationError}</Text> : null}
            {gpsStatus !== 'granted' ? <Text style={styles.helper}>{locationStatusMessage(gpsStatus)}</Text> : null}
            {farFromSaved ? (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>Your current and saved locations are more than 50 km apart.</Text>
                <Pressable accessibilityRole="button" onPress={useSavedLocation}><Text style={styles.linkText}>Use saved location instead</Text></Pressable>
              </View>
            ) : null}
            {locationEditorOpen ? (
              <LocationEditor
                query={locationSearchText}
                onQueryChange={(value) => { setLocationSearchText(value); setLocationCandidates([]); }}
                candidates={locationCandidates}
                loading={locationSearchLoading}
                saving={savingLocation}
                error={locationSearchError}
                onSearch={() => void searchLocation()}
                onChoose={(candidate) => void chooseSavedLocation(candidate)}
                onClose={() => setLocationEditorOpen(false)}
                attribution={locationAttribution}
              />
            ) : null}
            <Text style={styles.fieldLabel}>Search radius</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Search radius, ${radiusOptionLabel(flow.radiusKm)}`}
              accessibilityState={{ expanded: radiusMenuOpen }}
              onPress={() => setRadiusMenuOpen((open) => !open)}
              style={styles.radiusSelect}
            >
              <Text style={styles.radiusValue}>{radiusOptionLabel(flow.radiusKm)}</Text>
              <Text style={styles.radiusChevron}>{radiusMenuOpen ? '⌃' : '⌄'}</Text>
            </Pressable>
            {radiusMenuOpen ? (
              <View accessibilityRole="radiogroup" accessibilityLabel="Radius options" style={styles.radiusMenu}>
                {RADIUS_OPTIONS_KM.map((radius) => (
                  <Pressable
                    key={radius}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: flow.radiusKm === radius }}
                    onPress={() => void selectRadius(radius)}
                    style={[styles.radiusOption, flow.radiusKm === radius && styles.radiusOptionSelected]}
                  >
                    <Text style={[styles.radiusOptionText, flow.radiusKm === radius && styles.radiusOptionTextSelected]}>{radiusOptionLabel(radius)}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {radiusError ? <Text accessibilityRole="alert" style={styles.error}>{radiusError}</Text> : null}
            {!origin && !locationLoading ? <Text style={styles.locationRequired}>Set your location to see produce near you.</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={locationLoading}
              onPress={() => {
                if (origin) {
                  setFlow((current) => continueMarketFlow(current));
                } else {
                  setLocationEditorOpen(true);
                }
              }}
              style={[styles.primaryButton, locationLoading && styles.buttonDisabled]}
            >
              <Text style={styles.primaryButtonText}>{locationLoading ? 'Checking location…' : origin ? 'Go to Market' : 'Set location to continue'}</Text>
            </Pressable>
          </View>
        ) : null}

        {flow.screen === 'categories' ? (
          <View style={styles.panel}>
            <View style={styles.headingRow}>
              <View>
                <Text style={styles.radiusSummary}>Within {radiusOptionLabel(flow.radiusKm)}</Text>
                <Text accessibilityRole="header" style={styles.title}>Choose a category</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => setFlow((current) => changeMarketRadius(current))} style={styles.textButton}>
                <Text style={styles.linkText}>Change radius</Text>
              </Pressable>
            </View>
            {categoriesLoading ? (
              <StateMessage loading text="Loading market categories…" />
            ) : categoriesError ? (
              <StateMessage error={categoriesError} onRetry={() => { setCategoriesError(''); setCategoriesLoading(true); void getMarketCategories().then(setCategories).catch((cause: unknown) => setCategoriesError(cause instanceof ApiError ? cause.message : 'Categories could not be loaded.')).finally(() => setCategoriesLoading(false)); }} />
            ) : categories.length === 0 ? (
              <StateMessage text="No market categories are available yet." />
            ) : (
              <View style={styles.categoryGrid}>
                {categories.map((category) => (
                  <Pressable key={category.id} accessibilityRole="button" onPress={() => chooseCategory(category)} style={styles.categoryTile}>
                    <Text accessible={false} style={[styles.categoryMark, { backgroundColor: categoryColor(category.slug) }]}>{categoryIcon(category.slug)}</Text>
                    <Text style={styles.categoryName}>{category.name}</Text>
                    <Text style={styles.categoryArrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {flow.screen === 'produce' ? (
          <View style={styles.panel}>
            <View style={styles.headingRow}>
              <View style={styles.headingCopy}>
                <Text style={styles.radiusSummary}>Within {radiusOptionLabel(flow.radiusKm)}</Text>
                <Text accessibilityRole="header" style={styles.title}>{categories.find((category) => category.id === flow.categoryId)?.name ?? 'Produce'}</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={() => setFlow((current) => changeMarketRadius(current))} style={styles.textButton}>
                <Text style={styles.linkText}>Change radius</Text>
              </Pressable>
            </View>
            <LocationChip origin={origin} loading={locationLoading} onChange={() => setLocationEditorOpen((open) => !open)} />
            <LocationActions
              onUseCurrent={() => void refreshCurrentLocation()}
              onUseSaved={useSavedLocation}
              savedLocation={savedLocation}
              loading={locationLoading}
            />
            {locationError ? <Text accessibilityRole="alert" style={styles.error}>{locationError}</Text> : null}
            {gpsStatus !== 'granted' ? <Text style={styles.helper}>{locationStatusMessage(gpsStatus)}</Text> : null}
            {farFromSaved ? (
              <View style={styles.noticeBox}>
                <Text style={styles.noticeText}>Your current and saved locations are more than 50 km apart.</Text>
                <Pressable accessibilityRole="button" onPress={useSavedLocation}><Text style={styles.linkText}>Use saved location instead</Text></Pressable>
              </View>
            ) : null}
            {locationEditorOpen ? (
              <LocationEditor
                query={locationSearchText}
                onQueryChange={(value) => { setLocationSearchText(value); setLocationCandidates([]); }}
                candidates={locationCandidates}
                loading={locationSearchLoading}
                saving={savingLocation}
                error={locationSearchError}
                onSearch={() => void searchLocation()}
                onChoose={(candidate) => void chooseSavedLocation(candidate)}
                onClose={() => setLocationEditorOpen(false)}
                attribution={locationAttribution}
              />
            ) : null}
            <View style={styles.searchLabelRow}>
              <Text style={styles.fieldLabel}>Search produce</Text>
              {flow.searchText ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Clear produce search" onPress={() => setFlow((current) => ({ ...current, searchText: '', query: '' }))}>
                  <Text style={styles.linkText}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.searchRow}>
              <TextInput
                accessibilityLabel="Search produce by name"
                placeholder="e.g. Tomatoes"
                placeholderTextColor="#65736a"
                returnKeyType="search"
                value={flow.searchText}
                onChangeText={(searchText) => setFlow((current) => ({ ...current, searchText }))}
                onSubmitEditing={() => setFlow((current) => ({ ...current, query: current.searchText.trim() }))}
                style={styles.searchInput}
              />
              <Pressable accessibilityRole="button" onPress={() => setFlow((current) => ({ ...current, query: current.searchText.trim() }))} style={styles.searchButton}>
                <Text style={styles.searchButtonText}>Search</Text>
              </Pressable>
            </View>
            {!origin ? (
              <View style={styles.stateBox}>
                <Text accessibilityRole="header" style={styles.stateTitle}>Set your location to see produce near you</Text>
                <Pressable accessibilityRole="button" onPress={() => setLocationEditorOpen(true)} style={styles.retryButton}><Text style={styles.retryText}>Set location</Text></Pressable>
              </View>
            ) : produceLoading ? (
              <StateMessage loading text="Finding produce nearby…" />
            ) : produceError ? (
              <StateMessage
                error={produceError}
                onRetry={() => setProduceRetryCount((count) => count + 1)}
              />
            ) : visibleProduce.length === 0 ? (
              <View style={styles.stateBox}>
                <Text accessibilityRole="header" style={styles.stateTitle}>{flow.query ? 'No produce matches' : 'No produce types yet'}</Text>
                <Text style={styles.stateText}>{flow.query ? 'Try another name or clear your search.' : 'There are no produce types in this category yet.'}</Text>
              </View>
            ) : (
              <View style={styles.produceList}>
                {visibleProduce.map((item) => item.available ? (
                  <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}, ${item.listingCount} listings, nearest about ${item.nearestKmRounded} kilometres`} onPress={() => openListingResults(item)} style={styles.produceItem}>
                    <Text accessible={false} style={[styles.produceIcon, { backgroundColor: categoryColor(flow.categorySlug) }]}>{produceIcon(item.name, flow.categorySlug)}</Text>
                    <View style={styles.produceCopy}>
                      <Text style={styles.produceName}>{item.name}</Text>
                      <Text style={styles.produceMeta}>{item.listingCount} {item.listingCount === 1 ? 'listing' : 'listings'} · nearest ~{item.nearestKmRounded} km</Text>
                    </View>
                    <Text style={styles.produceArrow}>›</Text>
                  </Pressable>
                ) : (
                  <View key={item.id} style={styles.unavailableWrap}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name}. Not available in radius.`}
                      accessibilityState={{ disabled: true }}
                      disabled
                      style={styles.unavailableItem}
                    >
                      <Text accessible={false} style={[styles.produceIcon, styles.produceIconMuted]}>{produceIcon(item.name, flow.categorySlug)}</Text>
                      <View style={styles.produceCopy}>
                        <Text style={styles.unavailableName}>{item.name}</Text>
                        <Text style={styles.unavailableText}>Not available in radius</Text>
                      </View>
                    </Pressable>
                    <Pressable accessibilityRole="button" onPress={() => setFlow((current) => changeMarketRadius(current))} style={styles.unavailableChange}>
                      <Text style={styles.linkText}>Change radius</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            <Pressable accessibilityRole="button" onPress={() => setFlow((current) => ({ ...current, screen: 'categories' }))} style={styles.backButton}>
              <Text style={styles.linkText}>← All categories</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function LocationChip({ origin, loading, onChange }: { origin: MarketOrigin | null; loading: boolean; onChange: () => void }) {
  const label = loading
    ? 'Checking your location…'
    : origin?.source === 'current'
      ? 'Using your current location'
      : origin?.source === 'saved'
        ? `Using your saved location: ${origin.label}`
        : 'No location set';
  return (
    <View style={styles.locationChip}>
      <Text accessibilityRole="text" style={styles.locationChipText}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={onChange} style={styles.locationChange}>
        <Text style={styles.linkText}>Change</Text>
      </Pressable>
    </View>
  );
}

function LocationActions({
  onUseCurrent,
  onUseSaved,
  savedLocation,
  loading,
}: {
  onUseCurrent: () => void;
  onUseSaved: () => void;
  savedLocation: BuyerLocation | null;
  loading: boolean;
}) {
  return (
    <View style={styles.locationActions}>
      <Pressable accessibilityRole="button" disabled={loading} onPress={onUseCurrent} style={styles.locationAction}>
        <Text style={styles.locationActionText}>Use my current location</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={loading} onPress={onUseCurrent} style={styles.locationAction}>
        <Text style={styles.locationActionText}>Update location</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={loading && !savedLocation} onPress={onUseSaved} style={styles.locationAction}>
        <Text style={styles.locationActionText}>Use my saved location</Text>
      </Pressable>
    </View>
  );
}

function LocationEditor({
  query,
  onQueryChange,
  candidates,
  loading,
  saving,
  error,
  onSearch,
  onChoose,
  onClose,
  attribution,
}: {
  attribution: string;
  query: string;
  onQueryChange: (value: string) => void;
  candidates: LocationCandidate[];
  loading: boolean;
  saving: boolean;
  error: string;
  onSearch: () => void;
  onChoose: (candidate: LocationCandidate) => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.locationEditor}>
      <View style={styles.headingRow}>
        <Text accessibilityRole="header" style={styles.editorTitle}>Set a saved area</Text>
        <Pressable accessibilityRole="button" onPress={onClose}><Text style={styles.linkText}>Close</Text></Pressable>
      </View>
      <Text style={styles.helper}>Search for a South African town or suburb. Choose a result to save it to your buyer profile.</Text>
      <View style={styles.searchRow}>
        <TextInput
          accessibilityLabel="Town or suburb"
          placeholder="Town or suburb"
          placeholderTextColor="#65736a"
          returnKeyType="search"
          value={query}
          onChangeText={onQueryChange}
          onSubmitEditing={onSearch}
          style={styles.searchInput}
        />
        <Pressable accessibilityRole="button" disabled={loading || saving} onPress={onSearch} style={styles.searchButton}>
          <Text style={styles.searchButtonText}>{loading ? 'Searching…' : 'Search'}</Text>
        </Pressable>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {candidates.map((candidate) => (
        <Pressable
          key={`${candidate.latitude},${candidate.longitude},${candidate.label}`}
          accessibilityRole="button"
          disabled={saving}
          onPress={() => onChoose(candidate)}
          style={styles.locationCandidate}
        >
          <Text style={styles.candidateLabel}>{candidate.label}</Text>
          <Text style={styles.linkText}>{saving ? 'Saving…' : 'Use this area'}</Text>
        </Pressable>
      ))}
      {attribution ? <Text style={styles.attribution}>{attribution}</Text> : null}
    </View>
  );
}

function StateMessage({ loading, text, error, onRetry }: { loading?: boolean; text?: string; error?: string; onRetry?: () => void }) {
  if (loading) {
    return <View accessibilityRole="progressbar" style={styles.stateBox}><ActivityIndicator color="#235946" /><Text style={styles.stateText}>{text}</Text></View>;
  }
  return (
    <View style={styles.stateBox}>
      <Text accessibilityRole="header" style={styles.stateTitle}>{error ? 'Market unavailable' : text}</Text>
      {error ? <Text style={styles.stateText}>{error}</Text> : null}
      {error && onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable> : null}
    </View>
  );
}

async function getDeviceLocation(requestPermission = false): Promise<DeviceLocationResult> {
  try {
    if (
      Platform.OS === 'web' &&
      (typeof navigator === 'undefined' || !('geolocation' in navigator))
    ) {
      return { location: null, status: 'unsupported' };
    }
    let permission = await Location.getForegroundPermissionsAsync();
    if (permission.status !== 'granted' && requestPermission) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (permission.status === 'undetermined') return { location: null, status: 'prompt' };
    if (permission.status !== 'granted') return { location: null, status: 'denied' };

    let cached: Location.LocationObject | null = null;
    try {
      cached = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000, requiredAccuracy: 10_000 });
    } catch {
      cached = null;
    }
    if (cached) {
      return {
        location: { latitude: cached.coords.latitude, longitude: cached.coords.longitude },
        status: 'granted',
      };
    }
    const current = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      10_000,
    );
    return {
      location: { latitude: current.coords.latitude, longitude: current.coords.longitude },
      status: 'granted',
    };
  } catch (cause) {
    return {
      location: null,
      status: cause instanceof Error && cause.message === 'Location request timed out.' ? 'timeout' : 'unavailable',
    };
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      timeout = setTimeout(() => reject(new Error('Location request timed out.')), timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function locationStatusMessage(status: DeviceLocationResult['status']) {
  if (status === 'prompt') return 'Tap “Use my current location” to allow access, or choose a saved location.';
  if (status === 'denied') {
    return Platform.OS === 'web'
      ? 'Location is blocked for this site. Open the site settings beside the address bar, set Location to Allow, then reload. Or choose a saved location.'
      : 'Location is blocked for AgriMarket. Enable location in your device settings, or choose a saved location.';
  }
  if (status === 'unsupported') return 'This device or browser does not support geolocation. Use a saved location.';
  if (status === 'timeout') return 'Your location request timed out. Try again or use a saved location.';
  return 'Your current location is unavailable. Try again or use a saved location.';
}

const styles = StyleSheet.create({
  page: { minHeight: '100%', paddingHorizontal: 18, paddingTop: 26, paddingBottom: 40, backgroundColor: '#f3f5ed' },
  frame: { width: '100%', maxWidth: 900, alignSelf: 'center', gap: 14 },
  frameCompact: { maxWidth: 620 },
  eyebrow: { color: '#52675a', fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  panel: { padding: 22, borderWidth: 1, borderColor: '#d8ded4', borderRadius: 10, backgroundColor: '#fffefa', gap: 14 },
  title: { color: '#183f32', fontFamily: 'Georgia', fontSize: 30, lineHeight: 36 },
  description: { color: '#40554a', fontSize: 15, lineHeight: 23 },
  permissionNotice: { padding: 12, borderRadius: 6, backgroundColor: '#eaf0e7', color: '#294c3c', fontSize: 13, lineHeight: 19 },
  locationChip: { minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderColor: '#d2ded2', borderRadius: 6, backgroundColor: '#f4f7f1' },
  locationChipText: { flex: 1, color: '#254b3b', fontSize: 13, fontWeight: '700' },
  locationChange: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 },
  locationActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  locationAction: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: '#b8c9bc', borderRadius: 6 },
  locationActionText: { color: '#234c3a', fontSize: 12, fontWeight: '700' },
  noticeBox: { padding: 12, gap: 6, borderRadius: 6, backgroundColor: '#fff4da' },
  noticeText: { color: '#503d15', fontSize: 13 },
  fieldLabel: { color: '#2c4537', fontSize: 13, fontWeight: '800' },
  radiusSelect: { minHeight: 54, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#aebeb0', borderRadius: 6, backgroundColor: '#ffffff' },
  radiusValue: { color: '#183f32', fontSize: 16, fontWeight: '700' },
  radiusChevron: { color: '#235946', fontSize: 20 },
  radiusMenu: { padding: 6, borderWidth: 1, borderColor: '#cbd5ca', borderRadius: 6, backgroundColor: '#ffffff' },
  radiusOption: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 4 },
  radiusOptionSelected: { backgroundColor: '#e4eadf' },
  radiusOptionText: { color: '#183f32', fontSize: 15 },
  radiusOptionTextSelected: { fontWeight: '800' },
  primaryButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', marginTop: 4, borderRadius: 6, backgroundColor: '#235946' },
  primaryButtonText: { color: '#fffefa', fontSize: 15, fontWeight: '800' },
  buttonDisabled: { backgroundColor: '#75877c' },
  locationRequired: { color: '#d92d20', fontSize: 14, fontWeight: '800' },
  error: { color: '#922f25', fontSize: 13, lineHeight: 19 },
  helper: { color: '#4b5c51', fontSize: 12, lineHeight: 18 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  headingCopy: { flexShrink: 1 },
  radiusSummary: { marginBottom: 4, color: '#52675a', fontSize: 12, fontWeight: '800' },
  textButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { color: '#235946', fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  categoryTile: { flexGrow: 1, flexBasis: 240, minHeight: 90, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#d2ded2', borderRadius: 8, backgroundColor: '#f7f9f4' },
  categoryMark: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', fontSize: 28, lineHeight: 52, textAlign: 'center' },
  categoryName: { flex: 1, color: '#183f32', fontSize: 16, fontWeight: '800' },
  categoryArrow: { color: '#235946', fontSize: 24 },
  stateBox: { minHeight: 118, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 9, borderRadius: 6, backgroundColor: '#f2f5ef' },
  stateTitle: { color: '#234637', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  stateText: { color: '#4b5c51', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  retryButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 6, backgroundColor: '#e4eadf' },
  retryText: { color: '#183f32', fontSize: 13, fontWeight: '800' },
  locationEditor: { padding: 14, gap: 10, borderWidth: 1, borderColor: '#cbd5ca', borderRadius: 8, backgroundColor: '#f8faf6' },
  editorTitle: { color: '#183f32', fontSize: 17, fontWeight: '800' },
  searchLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  searchRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: '#b8c9bc', borderRadius: 6, backgroundColor: '#ffffff', color: '#183f32', fontSize: 14 },
  searchButton: { minWidth: 84, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 6, backgroundColor: '#235946' },
  searchButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  locationCandidate: { minHeight: 52, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: '#d8ded4' },
  candidateLabel: { flex: 1, color: '#183f32', fontSize: 13, lineHeight: 18 },
  attribution: { color: '#52675a', fontSize: 10 },
  produceList: { gap: 8 },
  produceItem: { minHeight: 74, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderColor: '#d2ded2', borderRadius: 7, backgroundColor: '#f7f9f4' },
  produceCopy: { flex: 1, gap: 4 },
  produceName: { color: '#183f32', fontSize: 15, fontWeight: '800' },
  produceMeta: { color: '#40554a', fontSize: 12 },
  produceArrow: { color: '#235946', fontSize: 24 },
  unavailableWrap: { minHeight: 88, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#d5d8d1', borderRadius: 7, backgroundColor: '#f1f2ee' },
  unavailableItem: { flex: 1, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: 0.7 },
  produceIcon: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden', fontSize: 24, lineHeight: 46, textAlign: 'center' },
  produceIconMuted: { backgroundColor: '#eef0ea' },
  unavailableName: { color: '#4e5750', fontSize: 15, fontWeight: '800' },
  unavailableText: { color: '#4e5750', fontSize: 12 },
  unavailableChange: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  backButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', marginTop: 4 },
});
