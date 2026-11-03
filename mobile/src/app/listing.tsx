import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useSession } from '@/components/session-provider';
import { ApiError, apiRequest, apiResourceUrl, getListing, type ListingDetail, type PublicBusiness } from '@/lib/api';

export default function ListingDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const listingId = params.id ?? '';
  const { user } = useSession();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [business, setBusiness] = useState<PublicBusiness | null>(null);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    if (!listingId) return;
    getListing(listingId)
      .then((result) => {
        if (!active) return;
        setListing(result.listing);
        setBusiness(result.business);
      })
      .catch((cause: unknown) => active && setError(cause instanceof ApiError ? cause.message : 'This listing could not be loaded.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [listingId]);

  async function shareListing() {
    const url = typeof window === 'undefined' ? '' : window.location.href;
    try {
      if (Platform.OS === 'web' && 'share' in navigator) {
        await navigator.share({ title: listing?.title, url });
      } else if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setNotice('Listing link copied.');
      }
    } catch {
      if (Platform.OS === 'web' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setNotice('Listing link copied.');
      }
    }
  }

  async function submitEnquiry() {
    setSubmitting(true);
    setNotice('');
    setError('');
    try {
      await apiRequest('/enquiries', {
        method: 'POST',
        headers: { 'Idempotency-Key': createRequestKey() },
        body: JSON.stringify({ listingId, message }),
      });
      setMessage('');
      setNotice('Your enquiry was sent to the supplier.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Your enquiry could not be sent.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!listingId) return <View style={styles.state}><Text style={styles.title}>Choose a listing</Text><Text style={styles.muted}>Open a supplier listing from the directory.</Text><Link href="/explore" style={styles.backLink}>Return to search</Link></View>;
  if (loading) return <View style={styles.state}><ActivityIndicator color="#235946" /><Text style={styles.muted}>Loading listing…</Text></View>;
  if (!listing || !business) return <View style={styles.state}><Text style={styles.title}>Listing unavailable</Text><Text style={styles.muted}>{error || 'This listing may no longer be public.'}</Text><Link href="/explore" style={styles.backLink}>Return to search</Link></View>;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.frame}>
        <Link href="/explore" style={styles.backLink}>← Back to suppliers</Link>
        <View style={styles.art}>
          {listing.images.length > 0 ? <Image accessibilityLabel={listing.images[0]?.altText} source={{ uri: apiResourceUrl(listing.images[0]!.url) }} resizeMode="cover" style={styles.heroImage} /> : <Text style={styles.artMark}>{listing.categoryName.slice(0, 1).toUpperCase()}</Text>}
          <View style={styles.badge}><Text style={styles.badgeText}>✓ VERIFIED BUSINESS</Text></View>
        </View>
        {listing.images.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>{listing.images.slice(1).map((image) => <Image key={image.id} accessibilityLabel={image.altText} source={{ uri: apiResourceUrl(image.url) }} resizeMode="cover" style={styles.galleryImage} />)}</ScrollView> : null}
        <View style={styles.columns}>
          <View style={styles.primary}>
            <Text style={styles.eyebrow}>{listing.categoryName} · {listing.type}</Text>
            <Text accessibilityRole="header" style={styles.title}>{listing.title}</Text>
            <Text style={styles.location}>{[listing.town, listing.province].filter(Boolean).join(', ')}</Text>
            <Text style={styles.description}>{listing.description}</Text>
            <View style={styles.divider} />
            <Text accessibilityRole="header" style={styles.sectionTitle}>About the supplier</Text>
            <Text style={styles.businessName}>{business.name}</Text>
            <Text style={styles.description}>{business.description || 'A verified South African supplier listed on AgriMarket.'}</Text>
            <Text style={styles.location}>{[business.town, business.province].filter(Boolean).join(', ')}</Text>
            <View style={styles.contactRow}>
              {business.contactPhone && <ContactAction label="Call supplier" url={`tel:${business.contactPhone}`} />}
              {business.whatsappPhone && <ContactAction label="WhatsApp" url={`https://wa.me/${business.whatsappPhone.replace('+', '')}`} />}
              {business.contactEmail && <ContactAction label="Email" url={`mailto:${business.contactEmail}`} />}
            </View>
            <Pressable accessibilityRole="button" onPress={shareListing} style={styles.shareButton}><Text style={styles.shareText}>↗  Share listing</Text></Pressable>
            {notice ? <Text accessibilityRole="status" style={styles.success}>{notice}</Text> : null}
          </View>

          <View style={styles.enquiryPanel}>
            <Text style={styles.eyebrow}>BUSINESS ENQUIRY</Text>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Talk to this supplier</Text>
            {user?.role === 'buyer' ? <>
              <Text style={styles.muted}>Your message will be delivered to {business.name}.</Text>
              <TextInput accessibilityLabel="Enquiry message" multiline maxLength={4000} placeholder="Introduce your business and what you need." placeholderTextColor="#78867d" value={message} onChangeText={setMessage} style={styles.messageInput} />
              <Text style={styles.counter}>{message.length}/4000</Text>
              <Pressable accessibilityRole="button" disabled={submitting || message.trim().length < 10} onPress={submitEnquiry} style={[styles.submitButton, (submitting || message.trim().length < 10) && styles.disabled]}><Text style={styles.submitText}>{submitting ? 'Sending…' : 'Send enquiry'}</Text></Pressable>
            </> : <>
              <Text style={styles.muted}>Sign in with a buyer account to send an in-app enquiry. You can contact the supplier using the details they provided.</Text>
              <Link href="/account" style={styles.signInLink}>Sign in or register</Link>
            </>}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function createRequestKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ContactAction({ label, url }: { label: string; url: string }) {
  if (Platform.OS === 'web') {
    return <a href={url} style={{ color: '#235946', fontWeight: 700, textDecoration: 'underline' }}>{label}</a>;
  }
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url).catch(() => Alert.alert('Unable to open contact', 'This contact action is unavailable on your device.'))}>
      <Text style={styles.contactAction}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingVertical: 26, paddingBottom: 50, backgroundColor: '#f3f5ed' },
  frame: { width: '100%', maxWidth: 1120, alignSelf: 'center' },
  backLink: { marginBottom: 15, color: '#235946', fontSize: 13, fontWeight: '700', textDecorationLine: 'none' },
  art: { height: 245, padding: 22, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', borderRadius: 8, backgroundColor: '#e8c977' },
  heroImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%', borderRadius: 8 },
  gallery: { paddingTop: 10, gap: 10 },
  galleryImage: { width: 112, height: 82, borderRadius: 5 },
  artMark: { color: 'rgba(24, 63, 50, 0.34)', fontFamily: 'Georgia', fontSize: 142, lineHeight: 160 },
  badge: { marginTop: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fffefa' },
  badgeText: { color: '#235946', fontSize: 10, fontWeight: '800' },
  columns: { marginTop: 28, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 30 },
  primary: { flexGrow: 2, flexBasis: 430, maxWidth: 700 },
  enquiryPanel: { flexGrow: 1, flexBasis: 280, padding: 19, borderWidth: 1, borderColor: '#d8ded4', borderRadius: 8, backgroundColor: '#fffefa', gap: 12 },
  eyebrow: { color: '#a05d3c', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  title: { marginTop: 7, color: '#183f32', fontFamily: 'Georgia', fontSize: 34, lineHeight: 39 },
  location: { marginTop: 8, color: '#65736a', fontSize: 13 },
  description: { marginTop: 20, color: '#364b3e', fontSize: 15, lineHeight: 25 },
  divider: { height: 1, marginVertical: 25, backgroundColor: '#d8ded4' },
  sectionTitle: { color: '#183f32', fontFamily: 'Georgia', fontSize: 23, lineHeight: 29 },
  businessName: { marginTop: 13, color: '#183f32', fontSize: 16, fontWeight: '800' },
  contactRow: { marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 17 },
  contactAction: { color: '#235946', fontWeight: '700', textDecorationLine: 'underline' },
  shareButton: { alignSelf: 'flex-start', marginTop: 20, paddingHorizontal: 12, paddingVertical: 9, borderColor: '#cbd5ca', borderWidth: 1, borderRadius: 5 },
  shareText: { color: '#235946', fontSize: 12, fontWeight: '700' },
  muted: { color: '#65736a', fontSize: 13, lineHeight: 20 },
  messageInput: { minHeight: 132, padding: 12, borderWidth: 1, borderColor: '#cbd5ca', borderRadius: 5, color: '#183f32', textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', color: '#65736a', fontSize: 10 },
  submitButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: '#183f32' },
  submitText: { color: '#fffefa', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.45 },
  signInLink: { color: '#235946', fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  success: { color: '#236449', fontSize: 12, lineHeight: 18 },
  error: { color: '#a23b32', fontSize: 12, lineHeight: 18 },
  state: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#f3f5ed' },
});