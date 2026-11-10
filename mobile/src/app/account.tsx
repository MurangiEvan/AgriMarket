import { Link } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, apiRequest, apiResourceUrl, getCategories, getSellerProduceTypes, type Category, type SellerProduceType, type SessionUser } from '@/lib/api';
import { categoryColor, categoryIcon, produceIcon } from '@/constants/produce-icons';
import { greeting, PageHero } from '@/components/page-hero';
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
type NativeUploadFile = { uri: string; name: string; type: string };
type ListingPhotoDraft = NativeUploadFile & { file?: File };

const provinces = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'Northern Cape', 'North West', 'Western Cape'];

function appendNativeUpload(form: FormData, field: string, file: NativeUploadFile) {
  // React Native FormData accepts URI parts; the web DOM type only declares Blob inputs.
  const nativeForm = form as FormData & { append(name: string, value: NativeUploadFile): void };
  nativeForm.append(field, file);
}

// Opens the browser file chooser. The input is attached to the page while open because some
// browsers (notably Safari) never report the selection for a detached input.
function pickWebFiles(accept: string, multiple: boolean, onPicked: (files: File[]) => void) {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = accept;
  picker.multiple = multiple;
  picker.style.display = 'none';
  picker.addEventListener('change', () => {
    const files = Array.from(picker.files ?? []);
    picker.remove();
    if (files.length) onPicked(files);
  });
  picker.addEventListener('cancel', () => picker.remove());
  document.body.appendChild(picker);
  picker.click();
}

function appendListingPhoto(form: FormData, photo: ListingPhotoDraft) {
  if (photo.file) {
    form.append('images', photo.file, photo.name);
    return;
  }
  appendNativeUpload(form, 'images', photo);
}

export default function AccountScreen() {
  const { user, signOut } = useSession();
  const [error, setError] = useState('');

  if (!user) {
    return <AccountFrame><Text style={styles.muted}>Your account is unavailable. Please sign in again.</Text></AccountFrame>;
  }

  return (
    <AccountFrame>
      <PageHero eyebrow={`${user.role.toUpperCase()} ACCOUNT`} title={greeting()} subtitle={`Signed in as ${user.email}`}>
        <Pressable accessibilityRole="button" onPress={() => signOut().catch(() => setError('Sign out failed.'))} style={styles.heroButton}><Text style={styles.heroButtonText}>Sign out</Text></Pressable>
      </PageHero>
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
  const [loadedProduceTypes, setLoadedProduceTypes] = useState<{ categoryId: string; items: SellerProduceType[] }>({ categoryId: '', items: [] });
  const [verification, setVerification] = useState<Verification | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [province, setProvince] = useState('Limpopo');
  const [town, setTown] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const produceTypes = loadedProduceTypes.categoryId === categoryId ? loadedProduceTypes.items : [];
  const produceTypesLoading = Boolean(categoryId) && loadedProduceTypes.categoryId !== categoryId;
  const [produceTypeId, setProduceTypeId] = useState('');
  const selectedCategorySlug = categories.find((item) => item.id === categoryId)?.slug ?? '';
  const visibleListings = listings.filter((listing) => listing.status !== 'archived');
  const [listingPhotoDraft, setListingPhotoDraft] = useState<ListingPhotoDraft | null>(null);
  const [photoNote, setPhotoNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingDocuments, setUploadingDocuments] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const previewUri = listingPhotoDraft?.uri;
    return () => {
      if (previewUri?.startsWith('blob:')) URL.revokeObjectURL(previewUri);
    };
  }, [listingPhotoDraft?.uri]);

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
      .then((result) => active && setLoadedProduceTypes({ categoryId, items: result }))
      .catch((cause: unknown) => {
        if (!active) return;
        setLoadedProduceTypes({ categoryId, items: [] });
        setError(cause instanceof ApiError ? cause.message : 'Produce types could not be loaded.');
      });
    return () => { active = false; };
  }, [categoryId]);

  // Each kind of work gets its own "in progress" flag so a slow photo upload never locks the document upload.
  async function runAction(action: () => Promise<void>, successMessage: string, setInProgress: (value: boolean) => void = setBusy) {
    setInProgress(true);
    setError('');
    setNotice('');
    try {
      await action();
      await refresh();
      setNotice(successMessage);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The change could not be saved.');
    } finally {
      setInProgress(false);
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

  async function addProducePhoto() {
    const produceType = produceTypes.find((item) => item.id === produceTypeId);
    const category = categories.find((item) => item.id === categoryId);
    if (!business) {
      setError('Save your business profile above before adding produce photos.');
      return;
    }
    if (!category || !produceType || !listingPhotoDraft) {
      setError('Choose a category, the produce type, and a photo.');
      return;
    }
    const note = photoNote.trim();
    const place = business.town ? ` in ${business.town}` : '';
    await runAction(async () => {
      // Each photo is stored as a listing so it appears in the buyer market under its produce type.
      const created = await apiRequest<{ listing: { id: string } }>('/seller/listings', {
        method: 'POST',
        body: JSON.stringify({
          categoryId,
          produceTypeId,
          title: produceType.name.length >= 3 ? produceType.name : `${produceType.name} produce`,
          description: note.length >= 10 ? note : `${produceType.name} from ${business.name}${place}.${note ? ` ${note}` : ''}`,
          province: business.province,
          town: business.town,
          type: category.slug === 'agricultural-services' ? 'service' : 'product',
        }),
      });
      const listingId = created.listing.id;
      try {
        const form = new FormData();
        appendListingPhoto(form, listingPhotoDraft);
        form.append('altTexts', JSON.stringify([`${produceType.name} from ${business.name}`.slice(0, 180)]));
        await apiRequest(`/seller/listings/${listingId}/images`, { method: 'POST', body: form });
      } catch (cause) {
        // Don't leave a photo-less entry behind if the upload failed.
        await apiRequest(`/seller/listings/${listingId}/archive`, { method: 'POST' }).catch(() => undefined);
        throw cause;
      }
      await apiRequest(`/seller/listings/${listingId}/submit`, { method: 'POST' });
      setListingPhotoDraft(null);
      setPhotoNote('');
    }, 'Photo added and sent to the admin for review. It goes live for buyers once approved.');
  }

  async function submitListing(id: string) {
    await runAction(async () => { await apiRequest(`/seller/listings/${id}/submit`, { method: 'POST' }); }, 'Photo sent to the admin for review.');
  }

  async function removeProducePhoto(id: string) {
    await runAction(async () => { await apiRequest(`/seller/listings/${id}/archive`, { method: 'POST' }); }, 'Photo removed. Buyers will no longer see it.');
  }

  async function chooseNewListingPhoto() {
    if (Platform.OS === 'web') {
      pickWebFiles('image/jpeg,image/png,image/webp', false, ([file]) => {
        if (file) setListingPhotoDraft({ uri: URL.createObjectURL(file), name: file.name, type: file.type || 'image/jpeg', file });
      });
      return;
    }

    try {
      const selection = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
      const image = selection.canceled ? undefined : selection.assets[0];
      if (!image) return;
      const extension = image.mimeType?.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
      setListingPhotoDraft({
        uri: image.uri,
        name: image.fileName ?? `listing-image.${extension}`,
        type: image.mimeType ?? 'image/jpeg',
      });
    } catch {
      setError('The photo library could not be opened. Check the app permissions and try again.');
    }
  }


  async function chooseDocuments() {
    if (Platform.OS === 'web') {
      pickWebFiles('application/pdf,image/jpeg,image/png', true, (files) => {
        if (files.length > 5) {
          setError('Choose no more than five verification documents.');
          return;
        }
        void runAction(async () => {
          const form = new FormData();
          files.forEach((file) => form.append('documents', file));
          await apiRequest('/seller/verification', { method: 'POST', body: form });
        }, 'Verification documents submitted for review.', setUploadingDocuments);
      });
      return;
    }

    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (selection.canceled) return;
      if (selection.assets.length > 5) {
        setError('Choose no more than five verification documents.');
        return;
      }
      if (!selection.assets.length) return;
      void runAction(async () => {
        const form = new FormData();
        selection.assets.forEach((file) => {
          const extension = file.name.split('.').pop()?.toLowerCase();
          const fallbackMimeType = extension === 'pdf'
            ? 'application/pdf'
            : extension === 'png'
              ? 'image/png'
              : 'image/jpeg';
          appendNativeUpload(form, 'documents', {
            uri: file.uri,
            name: file.name,
            type: file.mimeType ?? fallbackMimeType,
          });
        });
        await apiRequest('/seller/verification', { method: 'POST', body: form });
      }, 'Verification documents submitted for review.', setUploadingDocuments);
    } catch {
      setError('The document picker could not be opened. Try again or choose another file.');
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Business profile</Text><Text style={styles.statusTag}>{formatStatus(business?.verificationStatus ?? 'not_submitted')}</Text></View>
      <Text style={styles.muted}>Your business profile is visible publicly only after approval and publication.</Text>
      <Text style={styles.fieldLabel}>Business name</Text><TextInput accessibilityLabel="Business name" placeholder="e.g. Tomatoes by Thabo" placeholderTextColor="#7a877f" value={name} onChangeText={setName} style={styles.input} />
      <Text style={styles.fieldLabel}>Business description</Text><TextInput accessibilityLabel="Business description" placeholder="e.g. Family farm near Tzaneen growing tomatoes and peppers. We supply spaza shops and restaurants every week." placeholderTextColor="#7a877f" multiline value={description} onChangeText={setDescription} style={[styles.input, styles.multiline]} />
      <Text style={styles.fieldLabel}>Province</Text><ProvincePicker selected={province} onSelect={setProvince} />
      <Text style={styles.fieldLabel}>Business address or farm location</Text><TextInput accessibilityLabel="Business address or farm location" placeholder="e.g. Farm 12, R71 road, Tzaneen" placeholderTextColor="#7a877f" value={address} onChangeText={setAddress} style={styles.input} />
      <Text style={styles.fieldLabel}>Town or area</Text><TextInput accessibilityLabel="Town or area" placeholder="e.g. Tzaneen" placeholderTextColor="#7a877f" value={town} onChangeText={setTown} style={styles.input} />
      <Text style={styles.helper}>Your address is used to locate listings and is not shown to buyers. If omitted, the town or area is used.</Text>
      <Text style={styles.fieldLabel}>Contact email</Text><TextInput accessibilityLabel="Contact email" placeholder="e.g. orders@yourfarm.co.za" placeholderTextColor="#7a877f" autoCapitalize="none" keyboardType="email-address" value={contactEmail} onChangeText={setContactEmail} style={styles.input} />
      <Text style={styles.fieldLabel}>Mobile number</Text><TextInput accessibilityLabel="Mobile number" placeholder="e.g. 082 123 4567" placeholderTextColor="#7a877f" keyboardType="phone-pad" value={contactPhone} onChangeText={setContactPhone} style={styles.input} />
      <Text style={styles.fieldLabel}>WhatsApp number</Text><TextInput accessibilityLabel="WhatsApp number" placeholder="e.g. 082 123 4567" placeholderTextColor="#7a877f" keyboardType="phone-pad" value={whatsappPhone} onChangeText={setWhatsappPhone} style={styles.input} />
      <Pressable accessibilityRole="button" disabled={busy || name.trim().length < 2} onPress={saveBusiness} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Saving…' : 'Save business profile'}</Text></Pressable>

      <View style={styles.rule} />
      <Text style={styles.sectionTitle}>Your produce photos</Text>
      <Text style={styles.muted}>Add a photo of what you sell and choose what it is. Each photo is checked by the admin, then shown to buyers in the market under that produce.</Text>
      {visibleListings.length === 0 ? <Text style={styles.helper}>No photos yet. Add your first one below.</Text> : (
        <View style={styles.photoGrid}>
          {visibleListings.map((listing) => {
            const slug = categories.find((item) => item.id === listing.categoryId)?.slug ?? '';
            const photo = listing.images?.[0];
            const status = photoStatus(listing.status);
            return (
              <View key={listing.id} style={styles.photoCard}>
                {photo ? (
                  <Image accessibilityLabel={photo.altText} source={{ uri: apiResourceUrl(photo.url) }} contentFit="cover" style={styles.photoCardImage} />
                ) : (
                  <View style={[styles.photoCardImage, styles.photoCardPlaceholder, { backgroundColor: categoryColor(slug) }]}>
                    <Text accessible={false} style={styles.photoCardIcon}>{produceIcon(listing.title, slug)}</Text>
                  </View>
                )}
                <Text style={styles.listItemTitle} numberOfLines={1}>{listing.title}</Text>
                <Text style={[styles.photoStatus, { color: status.color }]}>{status.label}</Text>
                <View style={styles.listingActions}>
                  {listing.status === 'draft' || listing.status === 'rejected' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => submitListing(listing.id)} style={styles.smallButton}><Text style={styles.smallButtonText}>Send for review</Text></Pressable> : null}
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${listing.title} photo`} disabled={busy} onPress={() => removeProducePhoto(listing.id)} style={styles.smallButton}><Text style={styles.smallButtonText}>Remove</Text></Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.fieldLabel}>1. Category</Text>
      <View style={styles.choiceWrap}>{categories.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: categoryId === item.id }} onPress={() => { setCategoryId(item.id); setProduceTypeId(''); }} style={[styles.choice, categoryId === item.id && styles.choiceActive]}><Text style={[styles.choiceText, categoryId === item.id && styles.choiceTextActive]}>{categoryIcon(item.slug)} {item.name}</Text></Pressable>)}</View>
      <Text style={styles.fieldLabel}>2. What is it?</Text>
      <View style={styles.choiceWrap}>{produceTypes.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: produceTypeId === item.id }} onPress={() => setProduceTypeId(item.id)} style={[styles.choice, produceTypeId === item.id && styles.choiceActive]}><Text style={[styles.choiceText, produceTypeId === item.id && styles.choiceTextActive]}>{produceIcon(item.name, selectedCategorySlug)} {item.name}</Text></Pressable>)}</View>
      {produceTypes.length === 0 ? <Text style={styles.helper}>{produceTypesLoading ? 'Loading produce types…' : 'No produce types are available for this category yet.'}</Text> : null}
      <Text style={styles.fieldLabel}>3. Photo</Text>
      {listingPhotoDraft ? <View style={styles.photoPreview}>
        <Image accessibilityLabel="Selected produce photo preview" source={{ uri: listingPhotoDraft.uri }} contentFit="cover" style={styles.photoPreviewImage} />
        <View style={styles.photoPreviewFields}>
          <Text style={styles.muted} numberOfLines={1}>{listingPhotoDraft.name}</Text>
          <Pressable accessibilityRole="button" onPress={() => setListingPhotoDraft(null)} style={styles.smallButton}><Text style={styles.smallButtonText}>Choose a different photo</Text></Pressable>
        </View>
      </View> : <Pressable accessibilityRole="button" disabled={busy} onPress={() => void chooseNewListingPhoto()} style={styles.secondaryButton}><Text style={styles.secondaryText}>Choose photo</Text></Pressable>}
      <Text style={styles.helper}>JPEG, PNG or WebP. A clear, well-lit photo helps buyers.</Text>
      <Text style={styles.fieldLabel}>Short note for buyers (optional)</Text>
      <TextInput accessibilityLabel="Short note for buyers" placeholder="e.g. Fresh Roma tomatoes in 10 kg boxes, harvested every week" placeholderTextColor="#7a877f" multiline value={photoNote} onChangeText={setPhotoNote} style={[styles.input, styles.multiline]} />
      <Pressable accessibilityRole="button" disabled={busy || !business || !produceTypeId || !listingPhotoDraft} onPress={() => void addProducePhoto()} style={[styles.primaryButton, (busy || !business || !produceTypeId || !listingPhotoDraft) && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Uploading…' : 'Add photo'}</Text></Pressable>
      {!business ? <Text style={styles.helper}>Save your business profile above before adding produce photos.</Text> : null}

      <View style={styles.rule} />
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Verification</Text><Text style={styles.statusTag}>{formatStatus(verification?.verificationStatus ?? 'not_submitted')}</Text></View>
      <Text style={styles.muted}>Documents are private and can only be reviewed by an authorized administrator. Uploads use the storage configured on the AgriMarket server.</Text>
      {verification?.submissions.map((submission) => <View key={submission.id} style={styles.feedbackBox}><Text style={styles.listItemTitle}>{formatStatus(submission.status)} · {new Date(submission.submittedAt).toLocaleDateString()}</Text>{submission.sellerFeedback ? <Text style={styles.muted}>{submission.sellerFeedback}</Text> : null}</View>)}
      {verification?.verificationStatus !== 'approved' && verification?.verificationStatus !== 'pending' && <Pressable accessibilityRole="button" disabled={uploadingDocuments || !business} onPress={chooseDocuments} style={[styles.secondaryButton, (!business || uploadingDocuments) && styles.disabled]}><Text style={styles.secondaryText}>{uploadingDocuments ? 'Uploading documents…' : 'Choose verification documents'}</Text></Pressable>}
      {verification?.verificationStatus === 'pending' ? <Text style={styles.helper}>Your documents are with the admin for review. You can upload new ones if they ask for changes.</Text> : null}
      {!business ? <Text style={styles.helper}>Save your business profile above before uploading verification documents.</Text> : null}
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

function photoStatus(status: string): { label: string; color: string } {
  if (status === 'published') return { label: 'Live for buyers', color: '#235946' };
  if (status === 'pending') return { label: 'Waiting for admin review', color: '#a05d3c' };
  if (status === 'rejected') return { label: 'Rejected by admin', color: '#a12727' };
  return { label: 'Not sent for review', color: '#526259' };
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120, backgroundColor: '#f3f5ed' },
  frame: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: 14 },
  section: { marginTop: 18, padding: 22, gap: 12, borderWidth: 1, borderColor: '#e3e8de', borderRadius: 20, backgroundColor: '#ffffff', boxShadow: '0 8px 28px rgba(24, 63, 50, 0.08)' },
  heroButton: { minHeight: 42, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.95)' },
  heroButtonText: { color: '#183f32', fontSize: 14, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { color: '#183f32', fontFamily: 'Georgia', fontSize: 23, lineHeight: 29 },
  statusTag: { paddingHorizontal: 10, paddingVertical: 6, color: '#235946', backgroundColor: '#e4eadf', borderRadius: 16, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  muted: { color: '#65736a', fontSize: 13, lineHeight: 20 },
  fieldLabel: { marginTop: 5, color: '#364b3e', fontSize: 12, fontWeight: '800' },
  input: { minHeight: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: '#cbd5ca', borderRadius: 5, color: '#183f32', backgroundColor: '#fffefa' },
  multiline: { minHeight: 100, paddingTop: 12, textAlignVertical: 'top' },
  helper: { color: '#78867d', fontSize: 11, lineHeight: 17 },
  photoPreview: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderWidth: 1, borderColor: '#d8ded4', borderRadius: 6, backgroundColor: '#f3f5ed' },
  photoPreviewImage: { width: 92, height: 92, borderRadius: 4, backgroundColor: '#e4eadf' },
  photoPreviewFields: { flex: 1, gap: 7 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photoCard: { flexGrow: 1, flexBasis: 150, maxWidth: 220, gap: 6, padding: 10, borderWidth: 1, borderColor: '#d8ded4', borderRadius: 8, backgroundColor: '#f7f9f4' },
  photoCardImage: { width: '100%', aspectRatio: 1, borderRadius: 6, backgroundColor: '#e4eadf' },
  photoCardPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  photoCardIcon: { fontSize: 44 },
  photoStatus: { fontSize: 12, fontWeight: '700' },
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