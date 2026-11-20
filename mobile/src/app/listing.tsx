import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useSession } from '@/components/session-provider';
import { ApiError, apiRequest, apiResourceUrl, buyerOrganisationLabel, getListing, REPORT_REASONS, reportListing, type ListingDetail, type PublicBusiness, type PublicReview, type ReportReason } from '@/lib/api';
import { StarRow, StarSummary } from '@/components/star-rating';

export default function ListingDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const listingId = params.id ?? '';
  const { user } = useSession();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [business, setBusiness] = useState<PublicBusiness | null>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [needsBuyerProfile, setNeedsBuyerProfile] = useState(false);

  useEffect(() => {
    let active = true;
    if (!listingId) return;
    getListing(listingId)
      .then((result) => {
        if (!active) return;
        setListing(result.listing);
        setBusiness(result.business);
        setReviews(result.reviews ?? []);
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
      setNeedsBuyerProfile(cause instanceof ApiError && cause.code === 'BUYER_PROFILE_REQUIRED');
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
          <View style={styles.badgeRow}>
            <View style={styles.badgeInline}><Text style={styles.badgeText}>✓ VERIFIED BUSINESS</Text></View>
            {business.agrisetaSupported ? <View style={[styles.badgeInline, styles.badgeAgriseta]}><Text style={styles.badgeText}>★ AGRISETA-SUPPORTED</Text></View> : null}
            {listing.categorySlug === 'drone-services' && business.droneLicenceVerified ? <View style={styles.badgeInline}><Text style={styles.badgeText}>✈ SACAA LICENCE CHECKED</Text></View> : null}
          </View>
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
            <StarSummary average={business.ratingAverage} count={business.ratingCount} />
            <Text style={styles.description}>{business.description || 'A verified South African supplier listed on AgriMarket.'}</Text>
            <Text style={styles.location}>{[business.town, business.province].filter(Boolean).join(', ')}</Text>
            <View style={styles.contactRow}>
              {business.contactPhone && <ContactAction label="Call supplier" url={`tel:${business.contactPhone}`} />}
              {business.whatsappPhone && <ContactAction label="WhatsApp" url={`https://wa.me/${business.whatsappPhone.replace('+', '')}`} />}
              {business.contactEmail && <ContactAction label="Email" url={`mailto:${business.contactEmail}`} />}
            </View>
            {reviews.length > 0 ? (
              <View style={styles.reviews}>
                <Text accessibilityRole="header" style={styles.reviewsTitle}>What buyers say</Text>
                {reviews.map((review) => (
                  <View key={review.id} style={styles.review}>
                    <StarRow stars={review.stars} />
                    <Text style={styles.reviewText}>“{review.comment}”</Text>
                    <Text style={styles.reviewMeta}>{buyerOrganisationLabel(review.buyerType) || 'A buyer'} · {new Date(review.createdAt).toLocaleDateString()}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.linkageNote}>
              <Text style={styles.linkageText}>AgriMarket links verified businesses. It does not take payments or arrange delivery: agree price, payment and delivery directly with {business.name}.</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={shareListing} style={styles.shareButton}><Text style={styles.shareText}>↗  Share listing</Text></Pressable>
            {notice ? <Text accessibilityRole="status" style={styles.success}>{notice}</Text> : null}
            <View style={styles.safetyBox}>
              <Text style={styles.safetyTitle}>Stay safe when you deal</Text>
              <Text style={styles.safetyText}>• Never pay a deposit before you have seen the goods or confirmed the service.</Text>
              <Text style={styles.safetyText}>• Meet in a public place or at the farm, and take someone with you.</Text>
              <Text style={styles.safetyText}>• AgriMarket never asks you for payment, banking details or passwords.</Text>
              <Text style={styles.safetyText}>• If something feels wrong, report this listing.</Text>
            </View>
            <ReportListing listingId={listing.id} signedIn={Boolean(user)} />
          </View>

          <View style={styles.enquiryPanel}>
            <Text style={styles.eyebrow}>BUSINESS ENQUIRY</Text>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Talk to this supplier</Text>
            {user?.role === 'buyer' || user?.role === 'seller' ? <>
              <Text style={styles.muted}>Your message will be delivered to {business.name}.</Text>
              <TextInput accessibilityLabel="Enquiry message" placeholder="e.g. Hi, we run a restaurant in Polokwane and need 20 kg of tomatoes every week. Can you deliver?" placeholderTextColor="#7a877f" multiline maxLength={4000} value={message} onChangeText={setMessage} style={styles.messageInput} />
              <Text style={styles.counter}>{message.length}/4000</Text>
              <Pressable accessibilityRole="button" disabled={submitting || message.trim().length < 10} onPress={submitEnquiry} style={[styles.submitButton, (submitting || message.trim().length < 10) && styles.disabled]}><Text style={styles.submitText}>{submitting ? 'Sending…' : 'Send enquiry'}</Text></Pressable>
            </> : <>
              <Text style={styles.muted}>Sign in to send an in-app enquiry. You can contact the supplier using the details they provided.</Text>
              <Link href="/account" style={styles.signInLink}>Sign in or register</Link>
            </>}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            {needsBuyerProfile ? <Link href="/account" style={styles.signInLink}>Add who you buy for on your Profile</Link> : null}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function ReportListing({ listingId, signedIn }: { listingId: string; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    if (!reason) return;
    setSending(true);
    setError('');
    try {
      await reportListing(listingId, reason, details.trim());
      setSent(true);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Your report could not be sent. Try again.');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return <Text accessibilityRole="status" style={styles.reportDone}>Thank you. An AgriMarket administrator will review your report. The seller will not be told who reported it.</Text>;
  }
  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.reportToggle}>
        <Text style={styles.reportToggleText}>⚑  Report this listing</Text>
      </Pressable>
    );
  }
  if (!signedIn) {
    return (
      <View style={styles.reportPanel}>
        <Text style={styles.muted}>Sign in to report a listing, so administrators can follow up with you if needed.</Text>
        <Link href="/sign-in" style={styles.signInLink}>Sign in</Link>
      </View>
    );
  }
  const canSend = Boolean(reason) && !sending;
  return (
    <View style={styles.reportPanel}>
      <Text accessibilityRole="header" style={styles.reportTitle}>What is wrong with this listing?</Text>
      <View style={styles.reasonRow} accessibilityRole="radiogroup">
        {REPORT_REASONS.map((item) => {
          const selected = reason === item.value;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => setReason(item.value)}
              style={selected ? styles.reasonChipSelected : styles.reasonChip}
            >
              <Text style={selected ? styles.reasonTextSelected : styles.reasonText}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        accessibilityLabel="Report details"
        placeholder="Tell us what happened (optional), e.g. they asked for a deposit by EFT before showing the goods."
        placeholderTextColor="#7a877f"
        multiline
        maxLength={1000}
        value={details}
        onChangeText={setDetails}
        style={styles.reportInput}
      />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.reasonRow}>
        <Pressable accessibilityRole="button" disabled={!canSend} onPress={send} style={canSend ? styles.reportSend : styles.reportSendDisabled}>
          <Text style={styles.submitText}>{sending ? 'Sending…' : 'Send report'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.reportCancel}>
          <Text style={styles.shareText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
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
  page: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 26, paddingBottom: 120, backgroundColor: '#f3f5ed' },
  frame: { width: '100%', maxWidth: 1120, alignSelf: 'center' },
  backLink: { marginBottom: 15, color: '#235946', fontSize: 13, fontWeight: '700', textDecorationLine: 'none' },
  art: { height: 245, padding: 22, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', borderRadius: 8, backgroundColor: '#e8c977' },
  heroImage: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%', borderRadius: 8 },
  gallery: { paddingTop: 10, gap: 10 },
  galleryImage: { width: 112, height: 82, borderRadius: 5 },
  artMark: { color: 'rgba(24, 63, 50, 0.34)', fontFamily: 'Georgia', fontSize: 142, lineHeight: 160 },
  badgeRow: { flexShrink: 1, marginTop: 5, marginLeft: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 },
  badgeInline: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fffefa' },
  badgeAgriseta: { backgroundColor: '#fdf1cf' },
  linkageNote: { marginTop: 12, padding: 12, borderRadius: 10, borderLeftWidth: 3, borderLeftColor: '#c9a64a', backgroundColor: '#fbf6e8' },
  linkageText: { color: '#4d4630', fontSize: 12, lineHeight: 18 },
  badgeText: { color: '#235946', fontSize: 10, fontWeight: '800' },
  columns: { marginTop: 28, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 30 },
  // flexShrink lets both columns fit a phone screen instead of overflowing past the edge.
  primary: { flexGrow: 2, flexShrink: 1, flexBasis: 430, minWidth: 0, maxWidth: 700 },
  enquiryPanel: { flexGrow: 1, flexShrink: 1, flexBasis: 280, minWidth: 0, padding: 19, borderWidth: 1, borderColor: '#d8ded4', borderRadius: 8, backgroundColor: '#fffefa', gap: 12 },
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
  reviews: { marginTop: 20, gap: 10 },
  reviewsTitle: { color: '#183f32', fontSize: 16, fontWeight: '800' },
  review: { gap: 4, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e3e8de', backgroundColor: '#fffefa' },
  reviewText: { color: '#364b3e', fontSize: 14, lineHeight: 21 },
  reviewMeta: { color: '#78867d', fontSize: 11 },
  safetyBox: { marginTop: 18, padding: 14, gap: 4, borderRadius: 10, borderWidth: 1, borderColor: '#d8ded4', backgroundColor: '#fffefa' },
  safetyTitle: { marginBottom: 4, color: '#183f32', fontSize: 14, fontWeight: '800' },
  safetyText: { color: '#40554a', fontSize: 12, lineHeight: 18 },
  reportToggle: { alignSelf: 'flex-start', marginTop: 14, paddingVertical: 6 },
  reportToggleText: { color: '#a23b32', fontSize: 12, fontWeight: '700', textDecorationLine: 'underline' },
  reportDone: { marginTop: 14, color: '#236449', fontSize: 12, lineHeight: 18 },
  reportPanel: { marginTop: 14, padding: 14, gap: 10, borderRadius: 10, borderWidth: 1, borderColor: '#efc9bf', backgroundColor: '#fbeae5' },
  reportTitle: { color: '#183f32', fontSize: 15, fontWeight: '800' },
  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: '#cbd5ca', backgroundColor: '#fffefa' },
  reasonChipSelected: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: '#183f32', backgroundColor: '#183f32' },
  reasonText: { color: '#40554a', fontSize: 12, fontWeight: '700' },
  reasonTextSelected: { color: '#fffefa', fontSize: 12, fontWeight: '700' },
  reportInput: { minHeight: 80, padding: 10, borderWidth: 1, borderColor: '#cbd5ca', borderRadius: 5, backgroundColor: '#fffefa', color: '#183f32', textAlignVertical: 'top' },
  reportSend: { minHeight: 42, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: '#a23b32' },
  reportSendDisabled: { minHeight: 42, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: '#a23b32', opacity: 0.45 },
  reportCancel: { minHeight: 42, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 5, borderWidth: 1, borderColor: '#cbd5ca' },
  state: { flex: 1, minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#f3f5ed' },
});