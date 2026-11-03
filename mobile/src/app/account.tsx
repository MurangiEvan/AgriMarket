import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, apiRequest, getCategories, getSellerProduceTypes, type Category, type SellerProduceType, type SessionUser } from '@/lib/api';
import { useSession } from '@/components/session-provider';

type BusinessProfile = {
  id: string;
  name: string;
  description: string;
  address: string | null;
  province: string;
  town: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  whatsappPhone: string | null;
  verificationStatus: string;
};

type SellerListing = { id: string; title: string; description: string; categoryId: string; produceTypeId: string; active: boolean; inStock: boolean; expiresAt: string | null; type: 'product' | 'service'; town: string | null; status: string; province: string; images?: { id: string; altText: string; url: string }[] };
type Verification = { verificationStatus: string; submissions: { id: string; status: string; sellerFeedback: string | null; submittedAt: string }[] };

const provinces = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'];

export default function AccountScreen() {
  const { user, signOut } = useSession();
  const [error, setError] = useState('');

  if (!user) {
    return <AccountFrame><Text style={styles.muted}>Your account is unavailable. Please sign in again.</Text></AccountFrame>;
  }

  return (
    <AccountFrame>
      <View style={styles.accountHeader}>
        <View>
          <Text style={styles.eyebrow}>{user.role.toUpperCase()} ACCOUNT</Text>
          <Text accessibilityRole="header" style={styles.title}>Your account</Text>
          <Text style={styles.muted}>{user.email}</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => signOut().catch(() => setError('Sign out failed.'))} style={styles.secondaryButton}><Text style={styles.secondaryText}>Sign out</Text></Pressable>
      </View>
      {user.role === 'seller' ? <SellerDashboard user={user} /> : null}
      {user.role === 'buyer' ? <BuyerDashboard /> : null}
      {user.role === 'admin' ? <Link href="/admin" style={styles.linkText}>Open administrator review</Link> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </AccountFrame>
  );
}

function AccountFrame({ children }: React.PropsWithChildren) {
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"><View style={styles.frame}>{children}</View></ScrollView>;
}

function BuyerDashboard() {
  return <View style={styles.section}><Text style={styles.sectionTitle}>Your enquiries</Text><Text style={styles.muted}>Enquiries stay in your account so you can follow each supplier conversation.</Text><Link href="/market" style={styles.linkText}>Find produce near me</Link><Link href="/enquiries" style={styles.linkText}>View your enquiries</Link><Link href="/explore" style={styles.linkText}>Search the supplier directory</Link></View>;
}

function SellerDashboard({ user }: { user: SessionUser }) {
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [listings, setListings] = useState<SellerListing[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [produceTypes, setProduceTypes] = useState<SellerProduceType[]>([]);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [province, setProvince] = useState('Limpopo');
  const [town, setTown] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [listingTitle, setListingTitle] = useState('');
  const [listingDescription, setListingDescription] = useState('');
  const [listingProvince, setListingProvince] = useState('Limpopo');
  const [listingTown, setListingTown] = useState('');
  const [listingType, setListingType] = useState<'product' | 'service'>('product');
  const [categoryId, setCategoryId] = useState('');
  const [produceTypeId, setProduceTypeId] = useState('');
  const [listingActive, setListingActive] = useState(true);
  const [listingInStock, setListingInStock] = useState(true);
  const [listingExpiryDate, setListingExpiryDate] = useState('');
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [imageAltText, setImageAltText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    const [businessResult, listingResult, verificationResult, categoryResult] = await Promise.all([
      apiRequest<{ business: BusinessProfile | null }>('/seller/business'),
      apiRequest<SellerListing[]>('/seller/listings'),
      apiRequest<Verification>('/seller/verification'),
      getCategories(),
    ]);
    setBusiness(businessResult.business);
    setListings(listingResult);
    setVerification(verificationResult);
    setCategories(categoryResult);
    setCategoryId((value) => value || categoryResult[0]?.id || '');
    if (businessResult.business) {
      setName(businessResult.business.name);
      setDescription(businessResult.business.description);
      setAddress(businessResult.business.address ?? '');
      setProvince(businessResult.business.province);
      setTown(businessResult.business.town ?? '');
      setContactEmail(businessResult.business.contactEmail ?? '');
      setContactPhone(businessResult.business.contactPhone ?? '');
      setWhatsappPhone(businessResult.business.whatsappPhone ?? '');
    }
  }

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(refresh)
      .catch((cause: unknown) => active && setError(cause instanceof ApiError ? cause.message : 'Seller workspace could not be loaded.'));
    return () => { active = false; };
  }, [user.id]);

  useEffect(() => {
    let active = true;
    if (!categoryId) {
      return () => { active = false; };
    }
    getSellerProduceTypes(categoryId)
      .then((result) => active && setProduceTypes(result))
      .catch((cause: unknown) => active && setError(cause instanceof ApiError ? cause.message : 'Produce types could not be loaded.'));
    return () => { active = false; };
  }, [categoryId]);

  async function runAction(action: () => Promise<void>, successMessage: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await refresh();
      setNotice(successMessage);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The change could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function saveBusiness() {
    await runAction(async () => {
      await apiRequest('/seller/business', {
        method: 'PUT',
        body: JSON.stringify({ name, description, address: address || null, province, town: town || null, contactEmail: contactEmail || null, contactPhone: contactPhone || null, whatsappPhone: whatsappPhone || null }),
      });
    }, 'Business profile saved.');
  }

  async function saveListing() {
    if (listingExpiryDate.trim() && !isValidDateOnly(listingExpiryDate.trim())) {
      setError('Enter an expiry date in YYYY-MM-DD format.');
      return;
    }
    await runAction(async () => {
      const expiresAt = listingExpiryDate.trim()
        ? new Date(`${listingExpiryDate.trim()}T23:59:59.999+02:00`).toISOString()
        : null;
      await apiRequest(editingListingId ? `/seller/listings/${editingListingId}` : '/seller/listings', {
        method: editingListingId ? 'PUT' : 'POST',
        body: JSON.stringify({
          categoryId,
          produceTypeId,
          title: listingTitle,
          description: listingDescription,
          province: listingProvince,
          town: listingTown || null,
          type: listingType,
          active: listingActive,
          inStock: listingInStock,
          expiresAt,
        }),
      });
      setListingTitle('');
      setListingDescription('');
      setListingTown('');
      setProduceTypeId('');
      setListingActive(true);
      setListingInStock(true);
      setListingExpiryDate('');
      setEditingListingId(null);
    }, editingListingId ? 'Listing changes saved.' : 'Draft listing created. Submit it for review when it is ready.');
  }

  function editListing(listing: SellerListing) {
    setEditingListingId(listing.id);
    setListingTitle(listing.title);
    setListingDescription(listing.description);
    setListingProvince(listing.province);
    setListingTown(listing.town ?? '');
    setListingType(listing.type);
    setCategoryId(listing.categoryId);
    setProduceTypeId(listing.produceTypeId);
    setListingActive(listing.active);
    setListingInStock(listing.inStock);
    setListingExpiryDate(listing.expiresAt?.slice(0, 10) ?? '');
  }

  async function submitListing(id: string) {
    await runAction(async () => { await apiRequest(`/seller/listings/${id}/submit`, { method: 'POST' }); }, 'Listing submitted for review.');
  }

  async function chooseListingImage(listing: SellerListing) {
    const altText = imageAltText[listing.id]?.trim() ?? '';
    if (altText.length < 5) {
      setError('Write a short description for the image before uploading it.');
      return;
    }
    if (Platform.OS !== 'web') {
      setError('Listing photo uploads are available in the AgriMarket web app.');
      return;
    }
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/jpeg,image/png,image/webp';
    picker.onchange = () => {
      const file = picker.files?.[0];
      if (!file) return;
      void runAction(async () => {
        const form = new FormData();
        form.append('images', file);
        form.append('altTexts', JSON.stringify([altText]));
        await apiRequest(`/seller/listings/${listing.id}/images`, { method: 'POST', body: form });
        setImageAltText((current) => ({ ...current, [listing.id]: '' }));
      }, 'Listing photo uploaded.');
    };
    picker.click();
  }

  async function chooseDocuments() {
    if (Platform.OS !== 'web') {
      setError('Verification uploads are available in the AgriMarket web app.');
      return;
    }
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'application/pdf,image/jpeg,image/png';
    picker.multiple = true;
    picker.onchange = () => {
      const files = Array.from(picker.files ?? []).slice(0, 5);
      if (!files.length) return;
      void runAction(async () => {
        const form = new FormData();
        files.forEach((file) => form.append('documents', file));
        await apiRequest('/seller/verification', { method: 'POST', body: form });
      }, 'Verification documents submitted for review.');
    };
    picker.click();
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Business profile</Text><Text style={styles.statusTag}>{formatStatus(business?.verificationStatus ?? 'not_submitted')}</Text></View>
      <Text style={styles.muted}>Your business profile is visible publicly only after approval and publication.</Text>
      <Text style={styles.fieldLabel}>Business name</Text><TextInput accessibilityLabel="Business name" value={name} onChangeText={setName} style={styles.input} />
      <Text style={styles.fieldLabel}>Business description</Text><TextInput accessibilityLabel="Business description" multiline value={description} onChangeText={setDescription} style={[styles.input, styles.multiline]} />
      <Text style={styles.fieldLabel}>Province</Text><ProvincePicker selected={province} onSelect={setProvince} />
      <Text style={styles.fieldLabel}>Business address or farm location</Text><TextInput accessibilityLabel="Business address or farm location" value={address} onChangeText={setAddress} style={styles.input} />
      <Text style={styles.fieldLabel}>Town or area</Text><TextInput accessibilityLabel="Town or area" value={town} onChangeText={setTown} style={styles.input} />
      <Text style={styles.helper}>Your address is used to locate listings and is not shown to buyers. If omitted, the town or area is used.</Text>
      <Text style={styles.fieldLabel}>Contact email</Text><TextInput accessibilityLabel="Contact email" autoCapitalize="none" keyboardType="email-address" value={contactEmail} onChangeText={setContactEmail} style={styles.input} />
      <Text style={styles.fieldLabel}>Mobile number</Text><TextInput accessibilityLabel="Mobile number" keyboardType="phone-pad" value={contactPhone} onChangeText={setContactPhone} style={styles.input} />
      <Text style={styles.fieldLabel}>WhatsApp number</Text><TextInput accessibilityLabel="WhatsApp number" keyboardType="phone-pad" value={whatsappPhone} onChangeText={setWhatsappPhone} style={styles.input} />
      <Pressable accessibilityRole="button" disabled={busy || name.trim().length < 2} onPress={saveBusiness} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Saving…' : 'Save business profile'}</Text></Pressable>

      <View style={styles.rule} />
      <Text style={styles.sectionTitle}>Your listings</Text>
      {listings.map((listing) => <View key={listing.id} style={styles.listItem}>
        <View style={styles.listItemMain}>
          <Text style={styles.listItemTitle}>{listing.title}</Text>
          <Text style={styles.muted}>{listing.province} · {formatStatus(listing.status)} · {listing.images?.length ?? 0}/5 photos</Text>
          {(listing.images?.length ?? 0) < 5 && listing.status !== 'archived' ? <>
            <TextInput accessibilityLabel={`Alt text for ${listing.title} photo`} placeholder="Describe the photo for screen readers" value={imageAltText[listing.id] ?? ''} onChangeText={(value) => setImageAltText((current) => ({ ...current, [listing.id]: value }))} style={styles.input} />
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => chooseListingImage(listing)} style={styles.smallButton}><Text style={styles.smallButtonText}>Add photo</Text></Pressable>
          </> : null}
        </View>
          {listing.status !== 'archived' && <View style={styles.listingActions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => editListing(listing)} style={styles.smallButton}><Text style={styles.smallButtonText}>Edit</Text></Pressable>
            {listing.status === 'draft' && <Pressable accessibilityRole="button" disabled={busy} onPress={() => submitListing(listing.id)} style={styles.smallButton}><Text style={styles.smallButtonText}>Submit</Text></Pressable>}
          </View>}
      </View>)}
      {listings.length === 0 && <Text style={styles.muted}>No listings yet. Create your first listing below.</Text>}
      <Text style={styles.fieldLabel}>Listing title</Text><TextInput accessibilityLabel="Listing title" value={listingTitle} onChangeText={setListingTitle} style={styles.input} />
      <Text style={styles.fieldLabel}>Description</Text><TextInput accessibilityLabel="Listing description" multiline value={listingDescription} onChangeText={setListingDescription} style={[styles.input, styles.multiline]} />
      <Text style={styles.fieldLabel}>Category</Text>
      <View style={styles.choiceWrap}>{categories.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: categoryId === item.id }} onPress={() => { setCategoryId(item.id); setProduceTypeId(''); }} style={[styles.choice, categoryId === item.id && styles.choiceActive]}><Text style={[styles.choiceText, categoryId === item.id && styles.choiceTextActive]}>{item.name}</Text></Pressable>)}</View>
      <Text style={styles.fieldLabel}>Produce type</Text>
      <View style={styles.choiceWrap}>{produceTypes.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: produceTypeId === item.id }} onPress={() => setProduceTypeId(item.id)} style={[styles.choice, produceTypeId === item.id && styles.choiceActive]}><Text style={[styles.choiceText, produceTypeId === item.id && styles.choiceTextActive]}>{item.name}</Text></Pressable>)}</View>
      <Text style={styles.fieldLabel}>Listing type</Text><View style={styles.segment}>{(['product', 'service'] as const).map((item) => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: listingType === item }} onPress={() => setListingType(item)} style={[styles.segmentButton, listingType === item && styles.segmentActive]}><Text style={[styles.segmentText, listingType === item && styles.segmentTextActive]}>{item}</Text></Pressable>)}</View>
      <Text style={styles.fieldLabel}>Province</Text><ProvincePicker selected={listingProvince} onSelect={setListingProvince} />
      <Text style={styles.fieldLabel}>Town or area</Text><TextInput accessibilityLabel="Listing town or area" value={listingTown} onChangeText={setListingTown} style={styles.input} />
      <Text style={styles.fieldLabel}>Listing status</Text>
      <View style={styles.segment}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: listingActive }} onPress={() => setListingActive(true)} style={[styles.segmentButton, listingActive && styles.segmentActive]}><Text style={[styles.segmentText, listingActive && styles.segmentTextActive]}>Active</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: !listingActive }} onPress={() => setListingActive(false)} style={[styles.segmentButton, !listingActive && styles.segmentActive]}><Text style={[styles.segmentText, !listingActive && styles.segmentTextActive]}>Inactive</Text></Pressable>
      </View>
      <Text style={styles.fieldLabel}>Stock status</Text>
      <View style={styles.segment}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: listingInStock }} onPress={() => setListingInStock(true)} style={[styles.segmentButton, listingInStock && styles.segmentActive]}><Text style={[styles.segmentText, listingInStock && styles.segmentTextActive]}>In stock</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: !listingInStock }} onPress={() => setListingInStock(false)} style={[styles.segmentButton, !listingInStock && styles.segmentActive]}><Text style={[styles.segmentText, !listingInStock && styles.segmentTextActive]}>Out of stock</Text></Pressable>
      </View>
      <Text style={styles.fieldLabel}>Expiry date (optional, YYYY-MM-DD)</Text><TextInput accessibilityLabel="Listing expiry date" placeholder="2026-12-31" value={listingExpiryDate} onChangeText={setListingExpiryDate} style={styles.input} />
      {listingTitle.trim() ? <View style={styles.preview}><Text style={styles.previewLabel}>LISTING PREVIEW</Text><Text style={styles.previewTitle}>{listingTitle}</Text><Text style={styles.muted}>{[listingTown, listingProvince].filter(Boolean).join(', ')} · {categories.find((item) => item.id === categoryId)?.name ?? 'Choose a category'}</Text><Text style={styles.previewDescription}>{listingDescription || 'Your description will appear here.'}</Text></View> : null}
      <Pressable accessibilityRole="button" disabled={busy || !categoryId || !produceTypeId || listingTitle.trim().length < 3 || listingDescription.trim().length < 10} onPress={saveListing} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryText}>{editingListingId ? 'Save listing changes' : 'Create draft listing'}</Text></Pressable>
      {editingListingId ? <Pressable accessibilityRole="button" onPress={() => { setEditingListingId(null); setListingTitle(''); setListingDescription(''); setListingTown(''); }} style={styles.textButton}><Text style={styles.linkText}>Cancel editing</Text></Pressable> : null}

      <View style={styles.rule} />
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Verification</Text><Text style={styles.statusTag}>{formatStatus(verification?.verificationStatus ?? 'not_submitted')}</Text></View>
      <Text style={styles.muted}>Documents are private and can only be reviewed by an authorized administrator. Local uploads are for development only.</Text>
      {verification?.submissions.map((submission) => <View key={submission.id} style={styles.feedbackBox}><Text style={styles.listItemTitle}>{formatStatus(submission.status)} · {new Date(submission.submittedAt).toLocaleDateString()}</Text>{submission.sellerFeedback ? <Text style={styles.muted}>{submission.sellerFeedback}</Text> : null}</View>)}
      {verification?.verificationStatus !== 'approved' && <Pressable accessibilityRole="button" disabled={busy || !business} onPress={chooseDocuments} style={[styles.secondaryButton, (!business || busy) && styles.disabled]}><Text style={styles.secondaryText}>Choose verification documents</Text></Pressable>}
      <Text style={styles.helper}>PDF, JPEG, or PNG · maximum 5 documents, 10 MB each</Text>
      <Link href="/enquiries" style={styles.linkText}>Open seller enquiry inbox</Link>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text accessibilityRole="status" style={styles.success}>{notice}</Text> : null}
    </View>
  );
}

function ProvincePicker({ selected, onSelect }: { selected: string; onSelect: (value: string) => void }) {
  return <View style={styles.choiceWrap}>{provinces.map((province) => <Pressable key={province} accessibilityRole="button" accessibilityState={{ selected: province === selected }} onPress={() => onSelect(province)} style={[styles.choice, province === selected && styles.choiceActive]}><Text style={[styles.choiceText, province === selected && styles.choiceTextActive]}>{province}</Text></Pressable>)}</View>;
}

function formatStatus(value: string) {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingVertical: 28, paddingBottom: 50, backgroundColor: '#f3f5ed' },
  frame: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: 14 },
  accountHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eyebrow: { color: '#a05d3c', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  title: { marginTop: 5, color: '#183f32', fontFamily: 'Georgia', fontSize: 32, lineHeight: 38 },
  section: { marginTop: 20, padding: 18, gap: 10, borderWidth: 1, borderColor: '#d8ded4', borderRadius: 8, backgroundColor: '#fffefa' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { color: '#183f32', fontFamily: 'Georgia', fontSize: 23, lineHeight: 29 },
  statusTag: { paddingHorizontal: 10, paddingVertical: 6, color: '#235946', backgroundColor: '#e4eadf', borderRadius: 16, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  muted: { color: '#65736a', fontSize: 13, lineHeight: 20 },
  fieldLabel: { marginTop: 5, color: '#364b3e', fontSize: 12, fontWeight: '800' },
  input: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5ca', borderRadius: 5, color: '#183f32', backgroundColor: '#fffefa' },
  multiline: { minHeight: 100, paddingTop: 12, textAlignVertical: 'top' },
  helper: { color: '#78867d', fontSize: 11, lineHeight: 17 },
  segment: { flexDirection: 'row', padding: 3, borderWidth: 1, borderColor: '#d8ded4', borderRadius: 6, backgroundColor: '#edf0e8' },
  segmentButton: { minHeight: 39, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  segmentActive: { backgroundColor: '#183f32' },
  segmentText: { color: '#52675a', fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  segmentTextActive: { color: '#fffefa' },
  primaryButton: { minHeight: 46, marginTop: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 5, backgroundColor: '#183f32' },
  primaryText: { color: '#fffefa', fontSize: 13, fontWeight: '800' },
  secondaryButton: { minHeight: 42, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#aab9ab', borderRadius: 5 },
  secondaryText: { color: '#235946', fontSize: 12, fontWeight: '800' },
  textButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  linkText: { marginTop: 8, color: '#235946', fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  error: { color: '#a23b32', fontSize: 12, lineHeight: 18 },
  success: { color: '#236449', fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.45 },
  rule: { height: 1, marginVertical: 15, backgroundColor: '#d8ded4' },
  listItem: { minHeight: 56, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: 1, borderBottomColor: '#e5e9df' },
  listItemMain: { flex: 1, gap: 4 },
  listItemTitle: { color: '#183f32', fontSize: 13, fontWeight: '800' },
  smallButton: { minHeight: 36, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', borderRadius: 4, backgroundColor: '#e4eadf' },
  smallButtonText: { color: '#235946', fontSize: 11, fontWeight: '800' },
  listingActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  preview: { padding: 13, gap: 6, borderColor: '#d8ded4', borderWidth: 1, borderRadius: 6, backgroundColor: '#f3f5ed' },
  previewLabel: { color: '#a05d3c', fontSize: 9, fontWeight: '800' },
  previewTitle: { color: '#183f32', fontFamily: 'Georgia', fontSize: 18 },
  previewDescription: { color: '#364b3e', fontSize: 12, lineHeight: 19 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { minHeight: 34, paddingHorizontal: 10, justifyContent: 'center', borderWidth: 1, borderColor: '#d8ded4', borderRadius: 18, backgroundColor: '#fffefa' },
  choiceActive: { borderColor: '#183f32', backgroundColor: '#183f32' },
  choiceText: { color: '#52675a', fontSize: 11, fontWeight: '700' },
  choiceTextActive: { color: '#fffefa' },
  feedbackBox: { padding: 11, gap: 5, borderLeftWidth: 3, borderLeftColor: '#d98a51', backgroundColor: '#f3f5ed' },
});