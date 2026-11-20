import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, apiRequest, buyerOrganisationLabel, DEAL_VALUE_BANDS, outcomeSummary, rateSupplier, type DealValueBand, type EnquiryOutcome, type EnquiryRating } from '@/lib/api';
import { StarPicker, StarRow } from '@/components/star-rating';
import { HeroPill, PageHero } from '@/components/page-hero';
import { useSession } from '@/components/session-provider';

type EnquiryItem = {
  id: string;
  message: string;
  status: 'new' | 'read' | 'responded' | 'closed';
  outcome?: EnquiryOutcome | null;
  outcomeValueBand?: DealValueBand | null;
  rating?: EnquiryRating | null;
  createdAt: string;
  listingId: string;
  listingTitle: string;
  businessName?: string;
  buyerEmail?: string;
  buyerOrganisationName?: string | null;
  buyerOrganisationType?: string | null;
};

export default function EnquiriesScreen() {
  const { user, loading: sessionLoading } = useSession();
  const userId = user?.id ?? '';
  const userRole = user?.role;
  const [enquiries, setEnquiries] = useState<EnquiryItem[]>([]);
  const [loadedKey, setLoadedKey] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Sellers can buy too: they switch between enquiries buyers sent them and enquiries they sent.
  const [sellerView, setSellerView] = useState<'received' | 'sent'>('received');
  const inbox = userRole === 'seller' && sellerView === 'received';
  const path = inbox ? '/seller/enquiries' : '/enquiries/mine';
  const userKey = user ? `${user.id}:${user.role}:${path}` : '';
  const loading = sessionLoading || Boolean(userKey && loadedKey !== userKey);

  async function refresh() {
    if (!user) return;
    const result = await apiRequest<EnquiryItem[]>(path);
    setEnquiries(result);
  }

  useEffect(() => {
    let active = true;
    if (!sessionLoading && userId && (userRole === 'buyer' || userRole === 'seller')) {
      Promise.resolve()
        .then(() => apiRequest<EnquiryItem[]>(path))
        .then((result) => active && setEnquiries(result))
        .catch((cause: unknown) => active && setError(cause instanceof ApiError ? cause.message : 'Enquiries could not be loaded.'))
        .finally(() => active && setLoadedKey(`${userId}:${userRole}:${path}`));
    }
    return () => { active = false; };
  }, [sessionLoading, userId, userRole, path]);

  function switchView(next: 'received' | 'sent') {
    setEnquiries([]);
    setError('');
    setNotice('');
    setSellerView(next);
  }

  const [closingId, setClosingId] = useState('');

  async function updateStatus(id: string, status: EnquiryItem['status'], outcome?: { outcome: EnquiryOutcome; outcomeValueBand?: DealValueBand }) {
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/seller/enquiries/${id}`, { method: 'PATCH', body: JSON.stringify({ status, ...outcome }) });
      await refresh();
      setClosingId('');
      setNotice(status === 'closed' ? 'Enquiry closed. Thank you for recording the outcome.' : 'Enquiry status updated.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Enquiry status could not be updated.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.frame}>
        <PageHero
          eyebrow={user?.role === 'seller' ? 'SELLER WORKSPACE' : 'BUYER ACCOUNT'}
          title={inbox ? 'Supplier inbox' : 'Your enquiries'}
          subtitle={inbox ? 'Messages from buyers interested in your produce.' : 'Every conversation you have started with a supplier.'}
        >
          {user && (user.role === 'buyer' || user.role === 'seller') ? <HeroPill label={enquiries.length === 1 ? 'message' : 'messages'} value={enquiries.length} /> : null}
        </PageHero>
        {user?.role === 'seller' ? (
          <View style={styles.switcher} accessibilityRole="tablist">
            {([['received', 'Received from buyers'], ['sent', 'Sent by you']] as const).map(([value, label]) => (
              <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: sellerView === value }} onPress={() => switchView(value)} style={sellerView === value ? styles.switchActive : styles.switchTab}>
                <Text style={sellerView === value ? styles.switchTextActive : styles.switchText}>{label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {!user ? <View style={styles.panel}><Text style={styles.body}>Sign in to see enquiries linked to your account.</Text><Link href="/account" style={styles.link}>Sign in or register</Link></View> : null}
        {user && user.role === 'admin' ? <View style={styles.panel}><Text style={styles.body}>Administrator access is for review tasks. Enquiry access is limited to operational needs.</Text><Link href="/admin" style={styles.link}>Open administrator review</Link></View> : null}
        {user && (user.role === 'buyer' || user.role === 'seller') && loading ? <Text style={styles.body}>Loading enquiries…</Text> : null}
        {user && (user.role === 'buyer' || user.role === 'seller') && !loading && enquiries.length === 0 ? <View style={styles.panel}><Text style={styles.panelTitle}>No enquiries yet</Text><Text style={styles.body}>{inbox ? 'New buyer messages for your business will appear here.' : 'Your sent messages will appear here.'}</Text>{!inbox ? <Link href="/explore" style={styles.link}>Find suppliers</Link> : null}</View> : null}
        {enquiries.map((item) => <View key={item.id} style={styles.panel}>
          <View style={styles.row}><Text style={styles.panelTitle}>{item.listingTitle}</Text><Text style={styles.status}>{formatStatus(item.status)}</Text></View>
          {item.outcome ? <Text style={item.outcome === 'deal_made' ? styles.outcomeDeal : styles.outcomeNone}>{outcomeSummary(item.outcome, item.outcomeValueBand)}</Text> : null}
          <Text style={styles.body}>{inbox ? `From ${[item.buyerOrganisationName, buyerOrganisationLabel(item.buyerOrganisationType)].filter(Boolean).join(' · ') || 'a buyer'}${item.buyerEmail ? ` (${item.buyerEmail})` : ''}` : `To ${item.businessName ?? 'supplier'}`}</Text>
          <Text style={styles.message}>{item.message}</Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
          <Link href={{ pathname: '/listing', params: { id: item.listingId } }} style={styles.link}>Open listing</Link>
          {inbox && item.status !== 'closed' && closingId !== item.id ? <View style={styles.actions}>
            {item.status === 'new' && <Pressable accessibilityRole="button" disabled={busyId === item.id} onPress={() => updateStatus(item.id, 'read')} style={styles.smallAction}><Text style={styles.smallActionText}>Mark read</Text></Pressable>}
            {(item.status === 'new' || item.status === 'read') && <Pressable accessibilityRole="button" disabled={busyId === item.id} onPress={() => updateStatus(item.id, 'responded')} style={styles.smallAction}><Text style={styles.smallActionText}>Mark responded</Text></Pressable>}
            <Pressable accessibilityRole="button" disabled={busyId === item.id} onPress={() => setClosingId(item.id)} style={styles.smallAction}><Text style={styles.smallActionText}>Close</Text></Pressable>
          </View> : null}
          {!inbox && (item.status === 'responded' || item.status === 'closed') ? (
            <BuyerRating
              enquiryId={item.id}
              businessName={item.businessName ?? 'this supplier'}
              rating={item.rating ?? null}
              onSaved={async () => { await refresh(); setNotice('Thank you for rating the supplier.'); }}
            />
          ) : null}
          {inbox && item.status !== 'closed' && closingId === item.id ? (
            <CloseEnquiryForm
              busy={busyId === item.id}
              onCancel={() => setClosingId('')}
              onSubmit={(outcome, outcomeValueBand) => updateStatus(item.id, 'closed', { outcome, outcomeValueBand })}
            />
          ) : null}
        </View>)}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text accessibilityRole="status" style={styles.success}>{notice}</Text> : null}
      </View>
    </ScrollView>
  );
}

function formatStatus(status: string) { return status.replace(/^./, (value) => value.toUpperCase()); }

const commentNotes: Record<EnquiryRating['commentStatus'], string> = {
  none: '',
  pending: 'Your comment is waiting for an administrator before it appears on the listing.',
  approved: 'Your comment is shown on the listing.',
  hidden: 'Your comment is not shown publicly.',
};

// Buyers rate the supplier once the seller has responded. Stars are public straight away (as part of
// an average); comments only after an administrator approves them.
function BuyerRating({ enquiryId, businessName, rating, onSaved }: {
  enquiryId: string;
  businessName: string;
  rating: EnquiryRating | null;
  onSaved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [stars, setStars] = useState(rating?.stars ?? 0);
  const [comment, setComment] = useState(rating?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    try {
      await rateSupplier(enquiryId, stars, comment.trim(), Boolean(rating));
      setEditing(false);
      await onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Your rating could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return rating ? (
      <View style={styles.ratingBox}>
        <View style={styles.row}><Text style={styles.body}>Your rating</Text><StarRow stars={rating.stars} /></View>
        {rating.comment ? <Text style={styles.message}>“{rating.comment}”</Text> : null}
        {commentNotes[rating.commentStatus] ? <Text style={styles.date}>{commentNotes[rating.commentStatus]}</Text> : null}
        <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={styles.smallAction}><Text style={styles.smallActionText}>Change rating</Text></Pressable>
      </View>
    ) : (
      <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={styles.rateButton}>
        <Text style={styles.rateButtonText}>☆  Rate {businessName}</Text>
      </Pressable>
    );
  }

  const canSave = stars > 0 && !busy;
  return (
    <View style={styles.closeForm}>
      <Text style={styles.panelTitle}>How was dealing with {businessName}?</Text>
      <StarPicker value={stars} onChange={setStars} />
      <TextInput
        accessibilityLabel="Comment (optional)"
        placeholder="Add a comment for other buyers (optional). It is checked before it is shown."
        placeholderTextColor="#7a877f"
        multiline
        maxLength={500}
        value={comment}
        onChangeText={setComment}
        style={styles.commentInput}
      />
      <Text style={styles.date}>Your stars count towards the supplier&apos;s public average. Your name is never shown, only your type of organisation.</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={!canSave} onPress={() => void save()} style={canSave ? styles.closeButton : styles.closeButtonDisabled}>
          <Text style={styles.closeButtonText}>{busy ? 'Saving…' : rating ? 'Save changes' : 'Submit rating'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setEditing(false)} style={styles.smallAction}>
          <Text style={styles.smallActionText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Closing asks what came of the enquiry, so AgriMarket can report real deals rather than message counts.
function CloseEnquiryForm({ busy, onCancel, onSubmit }: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (outcome: EnquiryOutcome, band?: DealValueBand) => void;
}) {
  const [outcome, setOutcome] = useState<EnquiryOutcome | null>(null);
  const [band, setBand] = useState<DealValueBand | null>(null);
  const canSubmit = Boolean(outcome) && !busy;

  return (
    <View style={styles.closeForm}>
      <Text style={styles.panelTitle}>Did this enquiry lead to a deal?</Text>
      <View style={styles.actions} accessibilityRole="radiogroup">
        {([['deal_made', 'Yes, we made a deal'], ['no_deal', 'No deal']] as const).map(([value, label]) => (
          <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: outcome === value }} onPress={() => { setOutcome(value); if (value === 'no_deal') setBand(null); }} style={outcome === value ? styles.choiceActive : styles.choice}>
            <Text style={outcome === value ? styles.choiceTextActive : styles.choiceText}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {outcome === 'deal_made' ? (
        <>
          <Text style={styles.body}>Roughly how much was it worth? (optional, only shown to AgriMarket as a range)</Text>
          <View style={styles.actions} accessibilityRole="radiogroup">
            {DEAL_VALUE_BANDS.map((item) => (
              <Pressable key={item.value} accessibilityRole="radio" accessibilityState={{ checked: band === item.value }} onPress={() => setBand(band === item.value ? null : item.value)} style={band === item.value ? styles.choiceActive : styles.choice}>
                <Text style={band === item.value ? styles.choiceTextActive : styles.choiceText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={!canSubmit} onPress={() => outcome && onSubmit(outcome, band ?? undefined)} style={canSubmit ? styles.closeButton : styles.closeButtonDisabled}>
          <Text style={styles.closeButtonText}>{busy ? 'Closing…' : 'Close enquiry'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.smallAction}>
          <Text style={styles.smallActionText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120, backgroundColor: '#f3f5ed' },
  frame: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: 14 },
  panel: { padding: 20, gap: 10, borderWidth: 1, borderColor: '#e3e8de', borderRadius: 18, backgroundColor: '#ffffff', boxShadow: '0 8px 28px rgba(24, 63, 50, 0.08)' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  panelTitle: { color: '#183f32', fontSize: 15, fontWeight: '800' },
  status: { paddingHorizontal: 9, paddingVertical: 5, color: '#235946', backgroundColor: '#e4eadf', borderRadius: 14, fontSize: 10, fontWeight: '800' },
  body: { color: '#65736a', fontSize: 13, lineHeight: 20 },
  message: { color: '#364b3e', fontSize: 14, lineHeight: 22 },
  date: { color: '#78867d', fontSize: 10 },
  link: { color: '#235946', fontSize: 12, fontWeight: '800', textDecorationLine: 'underline' },
  actions: { marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  smallAction: { minHeight: 36, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, backgroundColor: '#e4eadf' },
  smallActionText: { color: '#235946', fontSize: 11, fontWeight: '800' },
  outcomeDeal: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#dff0e4', color: '#236449', fontSize: 11, fontWeight: '800' },
  outcomeNone: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#edf0ea', color: '#52675a', fontSize: 11, fontWeight: '800' },
  switcher: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: '#e4eadf' },
  switchTab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  switchActive: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#ffffff' },
  switchText: { color: '#52675a', fontSize: 12, fontWeight: '700' },
  switchTextActive: { color: '#183f32', fontSize: 12, fontWeight: '800' },
  ratingBox: { marginTop: 6, padding: 12, gap: 6, borderRadius: 12, backgroundColor: '#f8faf6' },
  rateButton: { alignSelf: 'flex-start', minHeight: 40, marginTop: 4, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: '#c98a12', backgroundColor: '#fdf1cf' },
  rateButtonText: { color: '#6b4f12', fontSize: 12, fontWeight: '800' },
  commentInput: { minHeight: 80, padding: 10, borderWidth: 1, borderColor: '#cbd5ca', borderRadius: 8, backgroundColor: '#ffffff', color: '#183f32', textAlignVertical: 'top' },
  closeForm: { marginTop: 6, padding: 14, gap: 10, borderRadius: 12, borderWidth: 1, borderColor: '#d8ded4', backgroundColor: '#f8faf6' },
  choice: { minHeight: 38, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: '#cbd5ca', backgroundColor: '#ffffff' },
  choiceActive: { minHeight: 38, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: '#183f32', backgroundColor: '#183f32' },
  choiceText: { color: '#40554a', fontSize: 12, fontWeight: '700' },
  choiceTextActive: { color: '#fffefa', fontSize: 12, fontWeight: '700' },
  closeButton: { minHeight: 40, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 999, backgroundColor: '#183f32' },
  closeButtonDisabled: { minHeight: 40, paddingHorizontal: 16, justifyContent: 'center', borderRadius: 999, backgroundColor: '#183f32', opacity: 0.45 },
  closeButtonText: { color: '#fffefa', fontSize: 12, fontWeight: '800' },
  error: { color: '#a23b32', fontSize: 12 },
  success: { color: '#236449', fontSize: 12 },
});