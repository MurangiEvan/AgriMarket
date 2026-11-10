import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Image } from 'expo-image';

import { ApiError, apiRequest, apiResourceUrl } from '@/lib/api';
import { greeting, HeroPill, PageHero } from '@/components/page-hero';
import { useSession } from '@/components/session-provider';

type VerificationItem = {
  id: string;
  status: string;
  submittedAt: string;
  businessId: string;
  businessName: string;
  province: string;
  ownerEmail: string;
  documentCount: number;
};
type ListingItem = { id: string; title: string; description?: string; town?: string | null; imageUrl?: string | null; businessName: string; verificationStatus: string; status: string };
type AuditItem = { id: string; action: string; targetType: string; targetId: string; actorId: string | null; createdAt: string };

export default function AdminScreen() {
  const { user } = useSession();
  const [queue, setQueue] = useState<VerificationItem[]>([]);
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    const [verificationResult, listingResult, auditResult] = await Promise.all([
      apiRequest<VerificationItem[]>('/admin/verifications?status=pending'),
      apiRequest<ListingItem[]>('/admin/listings'),
      apiRequest<AuditItem[]>('/admin/audit-logs?limit=20'),
    ]);
    setQueue(verificationResult);
    setListings(listingResult);
    setAudit(auditResult);
  }

  useEffect(() => {
    if (user?.role !== 'admin') return;
    Promise.resolve()
      .then(refresh)
      .catch((cause: unknown) => setError(cause instanceof ApiError ? cause.message : 'The review queue could not be loaded.'));
  }, [user?.id, user?.role]);

  async function decide(id: string, decision: 'approved' | 'rejected') {
    if (decision === 'rejected' && !feedback[id]?.trim()) {
      setError('Add seller-facing feedback before rejecting a submission.');
      return;
    }
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/admin/verifications/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, sellerFeedback: feedback[id]?.trim() || null, internalReason: null }),
      });
      await refresh();
      setNotice('Verification decision recorded and audited.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The decision could not be recorded.');
    } finally {
      setBusyId('');
    }
  }

  async function moderateListing(id: string, status: 'published' | 'rejected') {
    setBusyId(id);
    setError('');
    try {
      await apiRequest(`/admin/listings/${id}/moderation`, { method: 'PATCH', body: JSON.stringify({ status, reason: '' }) });
      await refresh();
      setNotice('Listing moderation recorded.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The listing could not be moderated.');
    } finally {
      setBusyId('');
    }
  }

  function openDocument(verificationId: string, index: number) {
    if (Platform.OS === 'web') {
      window.open(apiResourceUrl(`/api/v1/admin/verifications/${verificationId}/documents/${index}`), '_blank', 'noopener,noreferrer');
    } else {
      setNotice('Open this review queue in the AgriMarket web app to view private documents.');
    }
  }

  if (user?.role !== 'admin') {
    return <View style={styles.denied}><Text accessibilityRole="header" style={styles.title}>Administrator access required</Text><Text style={styles.body}>Admin permissions are assigned through the protected operational bootstrap, never public registration.</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.frame}>
        <PageHero eyebrow="AUTHORIZED STAFF" title={greeting()} subtitle="Check seller documents and produce photos. Every decision is recorded in the audit log.">
          <HeroPill label={queue.length === 1 ? 'business' : 'businesses'} value={queue.length} />
          <HeroPill label={listings.length === 1 ? 'photo' : 'photos'} value={listings.length} />
        </PageHero>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Review queue</Text>
        {queue.length === 0 ? <View style={styles.empty}><Text style={styles.panelTitle}>No pending submissions</Text><Text style={styles.body}>New verification requests will appear here.</Text></View> : null}
        {queue.map((item) => <View key={item.id} style={styles.panel}>
          <View style={styles.itemHeader}><View style={styles.itemCopy}><Text style={styles.panelTitle}>{item.businessName}</Text><Text style={styles.body}>{item.ownerEmail} · {item.province}</Text></View><Text style={styles.documentCount}>{item.documentCount} docs</Text></View>
          <Text style={styles.date}>Submitted {new Date(item.submittedAt).toLocaleString()}</Text>
          <View style={styles.docLinks}>{Array.from({ length: item.documentCount }, (_, index) => <Pressable key={index} accessibilityRole="button" onPress={() => openDocument(item.id, index)} style={styles.docButton}><Text style={styles.docText}>Document {index + 1}</Text></Pressable>)}</View>
          <Text style={styles.fieldLabel}>Feedback visible to seller (required when rejecting)</Text>
          <TextInput accessibilityLabel={`Seller feedback for ${item.businessName}`} placeholder="e.g. Please upload a clearer copy of your CIPC registration certificate." placeholderTextColor="#7a877f" multiline value={feedback[item.id] ?? ''} onChangeText={(value) => setFeedback((current) => ({ ...current, [item.id]: value }))} style={styles.input} />
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busyId === item.id} onPress={() => decide(item.id, 'approved')} style={styles.approve}><Text style={styles.approveText}>Approve business</Text></Pressable>
            <Pressable accessibilityRole="button" disabled={busyId === item.id} onPress={() => decide(item.id, 'rejected')} style={styles.reject}><Text style={styles.rejectText}>Reject</Text></Pressable>
          </View>
        </View>)}
        <Text accessibilityRole="header" style={styles.sectionTitle}>Listing moderation</Text>
        {listings.length === 0 ? <View style={styles.empty}><Text style={styles.panelTitle}>No photos waiting</Text><Text style={styles.body}>Produce photos sent by sellers will appear here for approval.</Text></View> : null}
        {listings.map((item) => <View key={item.id} style={styles.listingRow}>
          {item.imageUrl ? <Image accessibilityLabel={`Photo for ${item.title}`} source={{ uri: apiResourceUrl(item.imageUrl) }} contentFit="cover" style={styles.listingPhoto} /> : <View style={[styles.listingPhoto, styles.listingPhotoMissing]}><Text style={styles.date}>No photo</Text></View>}
          <View style={styles.itemCopy}>
            <Text style={styles.panelTitle}>{item.title}</Text>
            <Text style={styles.body}>{item.businessName}{item.town ? ` · ${item.town}` : ''}</Text>
            {item.description ? <Text style={styles.body} numberOfLines={3}>{item.description}</Text> : null}
            {item.verificationStatus !== 'approved' ? <Text style={styles.date}>Approve this business in the review queue above before publishing its photos.</Text> : null}
          </View>
          <View style={styles.actions}>
            {item.verificationStatus === 'approved' && <Pressable accessibilityRole="button" disabled={busyId === item.id} onPress={() => moderateListing(item.id, 'published')} style={styles.docButton}><Text style={styles.docText}>Approve &amp; publish</Text></Pressable>}
            <Pressable accessibilityRole="button" disabled={busyId === item.id} onPress={() => moderateListing(item.id, 'rejected')} style={styles.reject}><Text style={styles.rejectText}>Reject</Text></Pressable>
          </View>
        </View>)}
        <Text accessibilityRole="header" style={styles.sectionTitle}>Recent audit events</Text>
        {audit.map((item) => <View key={item.id} style={styles.auditRow}><Text style={styles.auditAction}>{item.action}</Text><Text style={styles.date}>{item.actorId ? `Actor ${item.actorId.slice(0, 8)}` : 'System'} · {new Date(item.createdAt).toLocaleString()}</Text></View>)}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text accessibilityRole="status" style={styles.success}>{notice}</Text> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 55, backgroundColor: '#f3f5ed' },
  frame: { width: '100%', maxWidth: 920, alignSelf: 'center', gap: 14 },
  denied: { flex: 1, minHeight: 320, padding: 24, justifyContent: 'center', gap: 12, backgroundColor: '#f3f5ed' },
  title: { color: '#183f32', fontFamily: 'Georgia', fontSize: 32 },
  sectionTitle: { marginTop: 18, color: '#183f32', fontFamily: 'Georgia', fontSize: 24 },
  body: { color: '#65736a', fontSize: 12, lineHeight: 18 },
  panel: { padding: 20, gap: 12, borderColor: '#e3e8de', borderWidth: 1, borderRadius: 18, backgroundColor: '#ffffff', boxShadow: '0 8px 28px rgba(24, 63, 50, 0.08)' },
  empty: { minHeight: 100, padding: 20, justifyContent: 'center', gap: 7, borderColor: '#e3e8de', borderWidth: 1, borderRadius: 18, backgroundColor: '#ffffff', boxShadow: '0 8px 28px rgba(24, 63, 50, 0.06)' },
  itemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  itemCopy: { flex: 1, gap: 4 },
  panelTitle: { color: '#183f32', fontSize: 14, fontWeight: '800' },
  documentCount: { paddingHorizontal: 9, paddingVertical: 5, color: '#235946', backgroundColor: '#e4eadf', borderRadius: 12, fontSize: 10, fontWeight: '800' },
  date: { color: '#78867d', fontSize: 10 },
  docLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  docButton: { minHeight: 35, paddingHorizontal: 10, justifyContent: 'center', borderWidth: 1, borderColor: '#aab9ab', borderRadius: 4 },
  docText: { color: '#235946', fontSize: 11, fontWeight: '800' },
  fieldLabel: { color: '#364b3e', fontSize: 11, fontWeight: '800' },
  input: { minHeight: 80, padding: 10, borderWidth: 1, borderColor: '#cbd5ca', borderRadius: 5, color: '#183f32', textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  approve: { minHeight: 39, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 4, backgroundColor: '#235946' },
  approveText: { color: '#fffefa', fontSize: 11, fontWeight: '800' },
  reject: { minHeight: 39, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 4, backgroundColor: '#f3e3da' },
  rejectText: { color: '#963f31', fontSize: 11, fontWeight: '800' },
  listingRow: { minHeight: 65, padding: 14, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14, borderWidth: 1, borderColor: '#e3e8de', borderRadius: 18, backgroundColor: '#ffffff', boxShadow: '0 8px 28px rgba(24, 63, 50, 0.08)' },
  listingPhoto: { width: 96, height: 96, borderRadius: 8, backgroundColor: '#e4eadf' },
  listingPhotoMissing: { alignItems: 'center', justifyContent: 'center' },
  auditRow: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#d8ded4' },
  auditAction: { color: '#183f32', fontSize: 12, fontWeight: '700' },
  error: { color: '#a23b32', fontSize: 12 },
  success: { color: '#236449', fontSize: 12 },
});