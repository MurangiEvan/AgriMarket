import { Link } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, apiRequest, apiResourceUrl, BUYER_ORGANISATION_TYPES, prepareForUpload, uploadWithRetry, buyerOrganisationLabel, getBuyerProfile, getCategories, getSellerProduceTypes, saveBuyerProfile, type BuyerOrganisationType, type BuyerProfile, type Category, type SellerProduceType, type SessionUser } from '@/lib/api';
import { categoryColor, categoryIcon, produceIcon, SERVICE_CATEGORY_SLUGS } from '@/constants/produce-icons';
import { greeting, PageHero } from '@/components/page-hero';
import { useSession } from '@/components/session-provider';

type BusinessProfile = {
  id: string;
  agrisetaSupportClaimed?: boolean;
  agrisetaReference?: string | null;
  agrisetaSupported?: boolean;
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
type ListingPhotoDraft = NativeUploadFile & { file?: File; size?: number };
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const MAX_DOCUMENTS = 5;

// Mirrors the server's completeness check so the seller sees what is missing before submitting.
function missingBusinessDetails(details: { name: string; description: string; town: string; contactEmail: string; contactPhone: string; whatsappPhone: string }) {
  const missing: string[] = [];
  if (details.name.trim().length < 2) missing.push('business name');
  if (details.description.trim().length < 10) missing.push('a description (10+ characters)');
  if (!details.town.trim()) missing.push('town or area');
  if (!details.contactEmail.trim() && !details.contactPhone.trim() && !details.whatsappPhone.trim()) missing.push('a contact number or email');
  return missing;
}

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

// Phone camera photos are often 4–12 MB and slow to send on mobile data.
// The server stores listing photos at up to 1600 px anyway, so shrink to that size first and
// save as JPEG. That is usually a few hundred KB.
const MAX_PHOTO_SIDE = 1600;

async function shrinkPhotoForUpload(image: ImagePicker.ImagePickerAsset): Promise<ListingPhotoDraft> {
  const original: ListingPhotoDraft = {
    uri: image.uri,
    name: image.fileName ?? `listing-image.${image.mimeType?.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'}`,
    type: image.mimeType ?? 'image/jpeg',
  };
  try {
    const context = ImageManipulator.manipulate(image.uri);
    if (image.width > MAX_PHOTO_SIDE || image.height > MAX_PHOTO_SIDE) {
      context.resize(image.width >= image.height ? { width: MAX_PHOTO_SIDE } : { height: MAX_PHOTO_SIDE });
    }
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
    return { uri: saved.uri, name: 'listing-photo.jpg', type: 'image/jpeg' };
  } catch {
    // If shrinking fails, send the original; the server still checks the size.
    return original;
  }
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
      <Link href="/help" style={styles.linkText}>Help & support</Link>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </AccountFrame>
  );
}

function AccountFrame({ children }: React.PropsWithChildren) {
  return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"><View style={styles.frame}>{children}</View></ScrollView>;
}

function BuyerOrganisation() {
  const [organisationName, setOrganisationName] = useState('');
  const [organisationType, setOrganisationType] = useState<BuyerOrganisationType | ''>('');
  const [saved, setSaved] = useState<BuyerProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    getBuyerProfile()
      .then((profile) => {
        if (!active) return;
        setSaved(profile);
        setOrganisationName(profile?.organisationName ?? '');
        setOrganisationType(profile?.organisationType ?? '');
        setLoaded(true);
      })
      .catch((cause: unknown) => { if (active) { setError(cause instanceof ApiError ? cause.message : 'Your organisation details could not be loaded.'); setLoaded(true); } });
    return () => { active = false; };
  }, []);

  async function save() {
    if (organisationName.trim().length < 2 || !organisationType) {
      setError('Enter your organisation name and choose its type.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const profile = await saveBuyerProfile({ organisationName: organisationName.trim(), organisationType });
      setSaved(profile);
      setNotice('Saved. Sellers will see who you buy for when you send an enquiry.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Your organisation details could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Who you buy for</Text>
        {saved ? <Text style={styles.statusTag}>{buyerOrganisationLabel(saved.organisationType)}</Text> : null}
      </View>
      {loaded && !saved ? (
        <View style={[styles.banner, styles.bannerWaiting]}>
          <Text style={styles.bannerTitle}>Tell sellers who you are</Text>
          <Text style={styles.bannerBody}>Add your organisation before sending your first enquiry. Sellers respond faster when they know they are dealing with a hotel, school, retailer or processor.</Text>
        </View>
      ) : null}
      <Text style={styles.fieldLabel}>Organisation name</Text>
      <TextInput accessibilityLabel="Organisation name" placeholder="e.g. Protea Hotel Polokwane" placeholderTextColor="#7a877f" value={organisationName} onChangeText={setOrganisationName} style={styles.input} />
      <Text style={styles.fieldLabel}>Type of organisation</Text>
      <View style={styles.choiceWrap}>
        {BUYER_ORGANISATION_TYPES.map((option) => (
          <Pressable key={option.value} accessibilityRole="button" accessibilityState={{ selected: organisationType === option.value }} onPress={() => setOrganisationType(option.value)} style={[styles.choice, organisationType === option.value && styles.choiceActive]}>
            <Text style={[styles.choiceText, organisationType === option.value && styles.choiceTextActive]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.primaryButton, saving && styles.disabled]}>
        <Text style={styles.primaryText}>{saving ? 'Saving…' : saved ? 'Save changes' : 'Save organisation'}</Text>
      </Pressable>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text accessibilityRole="status" style={styles.success}>{notice}</Text> : null}
    </View>
  );
}

function BuyerDashboard() {
  return <><BuyerOrganisation /><View style={styles.section}><Text style={styles.sectionTitle}>Your enquiries</Text><Text style={styles.muted}>Enquiries stay in your account so you can follow each supplier conversation.</Text><Link href="/market" style={styles.linkText}>Find produce near me</Link><Link href="/enquiries" style={styles.linkText}>View your enquiries</Link><Link href="/explore" style={styles.linkText}>Search the supplier directory</Link><Text style={styles.helper}>AgriMarket links you with verified businesses. Prices, payment and delivery are agreed directly with the seller.</Text></View></>;
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
  // Documents chosen for the application are kept on the phone until "Submit application".
  const [applicationDocuments, setApplicationDocuments] = useState<ListingPhotoDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [submittingApplication, setSubmittingApplication] = useState(false);
  const [uploadStage, setUploadStage] = useState('');
  // Optional: the seller says they are AgriSETA-supported; the admin confirms before a badge shows.
  const [agrisetaClaim, setAgrisetaClaim] = useState(false);
  const [agrisetaReference, setAgrisetaReference] = useState('');
  const applicationStatus = verification?.verificationStatus ?? business?.verificationStatus ?? 'not_submitted';
  const approved = applicationStatus === 'approved';
  const applying = applicationStatus === 'not_submitted' || applicationStatus === 'rejected';
  const latestFeedback = verification?.submissions.find((submission) => submission.status === 'rejected')?.sellerFeedback;
  const missingDetails = missingBusinessDetails({ name, description, town, contactEmail, contactPhone, whatsappPhone });
  const applicationChecklist = [
    { done: missingDetails.length === 0, label: missingDetails.length ? `Business details: add ${missingDetails.join(', ')}` : 'Business details complete' },
    { done: applicationDocuments.length > 0, label: applicationDocuments.length ? `${applicationDocuments.length} verification ${applicationDocuments.length === 1 ? 'document' : 'documents'} added` : 'Add at least one verification document' },
    { done: Boolean(produceTypeId && listingPhotoDraft), label: produceTypeId && listingPhotoDraft ? 'Photo of what you offer added' : 'Choose what you offer and add a photo' },
  ];
  const applicationReady = applicationChecklist.every((item) => item.done);
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
      await prepareForUpload();
      const created = await apiRequest<{ listing: { id: string } }>('/seller/listings', {
        method: 'POST',
        body: JSON.stringify({
          categoryId,
          produceTypeId,
          title: produceType.name.length >= 3 ? produceType.name : `${produceType.name} produce`,
          description: note.length >= 10 ? note : `${produceType.name} from ${business.name}${place}.${note ? ` ${note}` : ''}`,
          province: business.province,
          town: business.town,
          type: SERVICE_CATEGORY_SLUGS.has(category.slug) ? 'service' : 'product',
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
      setListingPhotoDraft(await shrinkPhotoForUpload(image));
    } catch {
      setError('The photo library could not be opened. Check the app permissions and try again.');
    }
  }


  function addApplicationDocuments(picked: ListingPhotoDraft[]) {
    setError('');
    // Check sizes on the phone so a seller is not left waiting for an upload the server will refuse.
    const tooLarge = picked.filter((file) => (file.size ?? 0) > MAX_DOCUMENT_BYTES);
    const files = picked.filter((file) => (file.size ?? 0) <= MAX_DOCUMENT_BYTES);
    if (tooLarge.length) setError(`${tooLarge.map((file) => file.name).join(', ')} ${tooLarge.length === 1 ? 'is' : 'are'} larger than 10 MB. Scan or save ${tooLarge.length === 1 ? 'it' : 'them'} at a lower quality, or as separate pages.`);
    setApplicationDocuments((current) => {
      const combined = [...current, ...files];
      if (combined.length > MAX_DOCUMENTS) setError(`You can add up to ${MAX_DOCUMENTS} documents. Remove one to add another.`);
      return combined.slice(0, MAX_DOCUMENTS);
    });
  }

  async function chooseDocuments() {
    if (Platform.OS === 'web') {
      pickWebFiles('application/pdf,image/jpeg,image/png', true, (files) => {
        addApplicationDocuments(files.map((file) => ({ uri: '', name: file.name, type: file.type || 'application/pdf', file, size: file.size })));
      });
      return;
    }

    try {
      const selection = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (selection.canceled || !selection.assets.length) return;
      addApplicationDocuments(selection.assets.map((file) => {
        const extension = file.name.split('.').pop()?.toLowerCase();
        const fallbackMimeType = extension === 'pdf' ? 'application/pdf' : extension === 'png' ? 'image/png' : 'image/jpeg';
        return { uri: file.uri, name: file.name, type: file.mimeType ?? fallbackMimeType, size: file.size };
      }));
    } catch {
      setError('The document picker could not be opened. Try again or choose another file.');
    }
  }

  // Sends the whole application at once: the latest business details, the documents and the
  // produce photo. The server only accepts it when every part is present.
  async function submitApplication() {
    if (!applicationReady || !listingPhotoDraft) {
      setError('Complete all three steps before submitting your application.');
      return;
    }
    const photo = listingPhotoDraft;
    await runAction(async () => {
      setUploadStage('Connecting to AgriMarket…');
      await prepareForUpload();
      await apiRequest('/seller/business', {
        method: 'PUT',
        body: JSON.stringify({ name, description, address: address || null, province, town: town || null, contactEmail: contactEmail || null, contactPhone: contactPhone || null, whatsappPhone: whatsappPhone || null }),
      });
      // Built fresh for each attempt, because an upload may be retried after a dropped connection.
      const buildForm = () => {
        const form = new FormData();
        for (const document of applicationDocuments) {
          if (document.file) form.append('documents', document.file, document.name);
          else appendNativeUpload(form, 'documents', { uri: document.uri, name: document.name, type: document.type });
        }
        if (photo.file) form.append('photo', photo.file, photo.name);
        else appendNativeUpload(form, 'photo', { uri: photo.uri, name: photo.name, type: photo.type });
        form.append('categoryId', categoryId);
        form.append('produceTypeId', produceTypeId);
        if (photoNote.trim()) form.append('note', photoNote.trim());
        form.append('agrisetaSupported', agrisetaClaim ? 'true' : 'false');
        if (agrisetaClaim && agrisetaReference.trim()) form.append('agrisetaReference', agrisetaReference.trim());
        return form;
      };
      setUploadStage('Sending your documents and photo…');
      // APPLICATION_PENDING on a retry means an earlier attempt already got through.
      await uploadWithRetry('/seller/application', buildForm, { alreadyDoneCodes: ['APPLICATION_PENDING'] });
      setApplicationDocuments([]);
      setListingPhotoDraft(null);
      setPhotoNote('');
    }, 'Application submitted. The admin will review your details, documents and photo together, and you will get a notification with the result.', (value) => { setSubmittingApplication(value); if (!value) setUploadStage(''); });
  }

  // Category, produce type, photo and note: used for the application photo and, after approval, for extra photos.
  const producePicker = (
    <>
      <Text style={styles.fieldLabel}>Category</Text>
      <View style={styles.choiceWrap}>{categories.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: categoryId === item.id }} onPress={() => { setCategoryId(item.id); setProduceTypeId(''); }} style={[styles.choice, categoryId === item.id && styles.choiceActive]}><Text style={[styles.choiceText, categoryId === item.id && styles.choiceTextActive]}>{categoryIcon(item.slug)} {item.name}</Text></Pressable>)}</View>
      <Text style={styles.fieldLabel}>What is it?</Text>
      <View style={styles.choiceWrap}>{produceTypes.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: produceTypeId === item.id }} onPress={() => setProduceTypeId(item.id)} style={[styles.choice, produceTypeId === item.id && styles.choiceActive]}><Text style={[styles.choiceText, produceTypeId === item.id && styles.choiceTextActive]}>{produceIcon(item.name, selectedCategorySlug)} {item.name}</Text></Pressable>)}</View>
      {produceTypes.length === 0 ? <Text style={styles.helper}>{produceTypesLoading ? 'Loading produce types…' : 'No produce types are available for this category yet.'}</Text> : null}
      <Text style={styles.fieldLabel}>Photo</Text>
      {listingPhotoDraft ? <View style={styles.photoPreview}>
        <Image accessibilityLabel="Selected produce photo preview" source={{ uri: listingPhotoDraft.uri }} contentFit="cover" style={styles.photoPreviewImage} />
        <View style={styles.photoPreviewFields}>
          <Text style={styles.muted} numberOfLines={1}>{listingPhotoDraft.name}</Text>
          <Pressable accessibilityRole="button" onPress={() => setListingPhotoDraft(null)} style={styles.smallButton}><Text style={styles.smallButtonText}>Choose a different photo</Text></Pressable>
        </View>
      </View> : <Pressable accessibilityRole="button" disabled={busy || submittingApplication} onPress={() => void chooseNewListingPhoto()} style={styles.secondaryButton}><Text style={styles.secondaryText}>Choose photo</Text></Pressable>}
      <Text style={styles.helper}>JPEG, PNG or WebP, up to 25 MB. A clear, well-lit photo helps buyers.</Text>
      <Text style={styles.fieldLabel}>Short description for buyers (optional)</Text>
      <TextInput accessibilityLabel="Short note for buyers" placeholder="e.g. Fresh Roma tomatoes in 10 kg boxes every week, or: drone spraying within 50 km of Tzaneen" placeholderTextColor="#7a877f" multiline value={photoNote} onChangeText={setPhotoNote} style={[styles.input, styles.multiline]} />
    </>
  );

  const banner = applicationStatus === 'approved'
    ? { tone: styles.bannerSuccess, title: 'Your business is verified', body: `Buyers can find you in the market${business?.agrisetaSupported ? ' with the AgriSETA-supported badge' : ''}. Add more products or services below; each one is checked by the admin before buyers see it.` }
    : applicationStatus === 'pending'
      ? { tone: styles.bannerWaiting, title: 'Your application is with the admin', body: 'The admin is reviewing your business details, documents and photo. You will get a notification as soon as it has been reviewed.' }
      : applicationStatus === 'rejected'
        ? { tone: styles.bannerProblem, title: 'Your application needs changes', body: `${latestFeedback ? `Admin feedback: ${latestFeedback} ` : ''}Fix what was asked, then submit the whole application again with your documents and a photo.` }
        : { tone: styles.bannerInfo, title: 'Apply to sell on AgriMarket', body: 'Complete the three steps below and submit them together. The admin reviews your whole application before buyers can see your business.' };

  return (
    <View style={styles.section}>
      <View style={[styles.banner, banner.tone]} accessibilityRole="summary">
        <Text style={styles.bannerTitle}>{banner.title}</Text>
        <Text style={styles.bannerBody}>{banner.body}</Text>
      </View>
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{applying ? 'Step 1 · Business details' : 'Business profile'}</Text><Text style={styles.statusTag}>{formatStatus(applicationStatus)}</Text></View>
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
      <Pressable accessibilityRole="button" disabled={busy || name.trim().length < 2} onPress={saveBusiness} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Saving…' : applying ? 'Save details for later' : 'Save changes'}</Text></Pressable>

      {applying ? (
        <>
          <View style={styles.rule} />
          <Text style={styles.sectionTitle}>Step 2 · Verification documents</Text>
          <Text style={styles.muted}>Proof that your business is real, such as a CIPC registration certificate, a farm lease or a municipal trading permit. Documents are private: only an authorised administrator can see them.</Text>
          {applicationDocuments.map((document, index) => (
            <View key={`${document.name}-${index}`} style={styles.documentRow}>
              <Text style={styles.documentName} numberOfLines={1}>📄 {document.name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${document.name}`} onPress={() => setApplicationDocuments((current) => current.filter((_, position) => position !== index))} style={styles.smallButton}><Text style={styles.smallButtonText}>Remove</Text></Pressable>
            </View>
          ))}
          <Pressable accessibilityRole="button" disabled={applicationDocuments.length >= MAX_DOCUMENTS} onPress={() => void chooseDocuments()} style={[styles.secondaryButton, applicationDocuments.length >= MAX_DOCUMENTS && styles.disabled]}>
            <Text style={styles.secondaryText}>{applicationDocuments.length ? 'Add another document' : 'Choose verification documents'}</Text>
          </Pressable>
          <Text style={styles.helper}>PDF, JPEG or PNG · up to 5 documents, 10 MB each. They are only sent when you submit your application.</Text>

          <View style={styles.rule} />
          <Text style={styles.sectionTitle}>Step 3 · What you offer</Text>
          <Text style={styles.muted}>Produce, livestock, processed products or a service such as equipment hire, drone spraying, transport or training. Add a photo that shows it. Once your application is approved, this photo goes live in the market.</Text>
          {producePicker}

          <View style={styles.rule} />
          <Text style={styles.sectionTitle}>Submit your application</Text>
          <Text style={styles.muted}>Your business details, documents and photo are sent to the admin together, as one application.</Text>
          <Text style={styles.fieldLabel}>AgriSETA support (optional)</Text>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agrisetaClaim }}
            onPress={() => setAgrisetaClaim((value) => !value)}
            style={[styles.choice, styles.checkboxRow, agrisetaClaim && styles.choiceActive]}
          >
            <Text style={[styles.choiceText, agrisetaClaim && styles.choiceTextActive]}>{agrisetaClaim ? '☑' : '☐'}  My business is supported by AgriSETA (e.g. a learnership, skills programme or grant)</Text>
          </Pressable>
          {agrisetaClaim ? (
            <>
              <TextInput accessibilityLabel="AgriSETA programme or reference number" placeholder="e.g. Learnership AGRI-2026-0142 or programme name" placeholderTextColor="#7a877f" value={agrisetaReference} onChangeText={setAgrisetaReference} style={styles.input} />
              <Text style={styles.helper}>The admin checks this before buyers see an AgriSETA-supported badge on your business. You can add proof to your verification documents.</Text>
            </>
          ) : null}
          <View style={styles.checklist}>
            {applicationChecklist.map((item) => (
              <Text key={item.label} style={[styles.checkItem, item.done && styles.checkItemDone]}>{item.done ? '✓' : '○'}  {item.label}</Text>
            ))}
          </View>
          <Pressable accessibilityRole="button" disabled={!applicationReady || submittingApplication} onPress={() => void submitApplication()} style={[styles.primaryButton, (!applicationReady || submittingApplication) && styles.disabled]}>
            <Text style={styles.primaryText}>{submittingApplication ? uploadStage || 'Submitting application…' : applicationStatus === 'rejected' ? 'Submit application again' : 'Submit application'}</Text>
          </Pressable>
        </>
      ) : null}

      {applicationStatus === 'pending' && visibleListings.length > 0 ? (
        <>
          <View style={styles.rule} />
          <Text style={styles.sectionTitle}>Sent with your application</Text>
          {photoGrid(false)}
        </>
      ) : null}

      {approved ? (
        <>
          <View style={styles.rule} />
          <Text style={styles.sectionTitle}>What you offer</Text>
          <Text style={styles.muted}>Add more products or services, each with a photo. Every new one is checked by the admin, then shown to buyers in the market.</Text>
          {visibleListings.length === 0 ? <Text style={styles.helper}>No photos yet. Add your first one below.</Text> : photoGrid(true)}
          {producePicker}
          <Pressable accessibilityRole="button" disabled={busy || !produceTypeId || !listingPhotoDraft} onPress={() => void addProducePhoto()} style={[styles.primaryButton, (busy || !produceTypeId || !listingPhotoDraft) && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Uploading…' : 'Add photo'}</Text></Pressable>
        </>
      ) : null}

      <Link href="/enquiries" style={styles.linkText}>Open seller enquiry inbox</Link>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text accessibilityRole="status" style={styles.success}>{notice}</Text> : null}
    </View>
  );

  function photoGrid(editable: boolean) {
    return (
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
                {editable ? <View style={styles.listingActions}>
                  {listing.status === 'draft' || listing.status === 'rejected' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => submitListing(listing.id)} style={styles.smallButton}><Text style={styles.smallButtonText}>Send for review</Text></Pressable> : null}
                  <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${listing.title} photo`} disabled={busy} onPress={() => removeProducePhoto(listing.id)} style={styles.smallButton}><Text style={styles.smallButtonText}>Remove</Text></Pressable>
                </View> : null}
              </View>
            );
          })}
        </View>
    );
  }
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
  banner: { gap: 6, padding: 16, borderRadius: 14, borderWidth: 1 },
  bannerInfo: { borderColor: '#cfe0cf', backgroundColor: '#eaf3e6' },
  bannerWaiting: { borderColor: '#ead9a6', backgroundColor: '#fbf4dd' },
  bannerProblem: { borderColor: '#efc9bf', backgroundColor: '#fbeae5' },
  bannerSuccess: { borderColor: '#bcdcc4', backgroundColor: '#e3f2e6' },
  bannerTitle: { color: '#183f32', fontSize: 15, fontWeight: '800' },
  bannerBody: { color: '#3f5147', fontSize: 13, lineHeight: 19 },
  documentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e3e8de', backgroundColor: '#fbfcf9' },
  documentName: { flex: 1, color: '#183f32', fontSize: 13, fontWeight: '600' },
  checkboxRow: { alignSelf: 'stretch', paddingVertical: 10 },
  checklist: { gap: 6, padding: 14, borderRadius: 12, backgroundColor: '#f3f5ed' },
  checkItem: { color: '#7a6a4f', fontSize: 13, lineHeight: 19 },
  checkItemDone: { color: '#235946', fontWeight: '700' },
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