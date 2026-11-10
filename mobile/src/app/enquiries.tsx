import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError, apiRequest } from '@/lib/api';
import { HeroPill, PageHero } from '@/components/page-hero';
import { useSession } from '@/components/session-provider';

type EnquiryItem = {
  id: string;
  message: string;
  status: 'new' | 'read' | 'responded' | 'closed';
  createdAt: string;
  listingId: string;
  listingTitle: string;
  businessName?: string;
  buyerEmail?: string;
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
  const userKey = user ? `${user.id}:${user.role}` : '';
  const loading = sessionLoading || Boolean(userKey && loadedKey !== userKey);

  async function refresh() {
    if (!user) return;
    const path = user.role === 'seller' ? '/seller/enquiries' : '/enquiries/mine';
    const result = await apiRequest<EnquiryItem[]>(path);
    setEnquiries(result);
  }

  useEffect(() => {
    let active = true;
    if (!sessionLoading && userId && userRole) {
      Promise.resolve()
        .then(() => apiRequest<EnquiryItem[]>(userRole === 'seller' ? '/seller/enquiries' : '/enquiries/mine'))
        .then((result) => active && setEnquiries(result))
        .catch((cause: unknown) => active && setError(cause instanceof ApiError ? cause.message : 'Enquiries could not be loaded.'))
        .finally(() => active && setLoadedKey(`${userId}:${userRole}`));
    }
    return () => { active = false; };
  }, [sessionLoading, userId, userRole]);

  async function updateStatus(id: string, status: EnquiryItem['status']) {
    setBusyId(id);
    setError('');
    setNotice('');
    try {
      await apiRequest(`/seller/enquiries/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await refresh();
      setNotice('Enquiry status updated.');
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
          title={user?.role === 'seller' ? 'Supplier inbox' : 'Your enquiries'}
          subtitle={user?.role === 'seller' ? 'Messages from buyers interested in your produce.' : 'Every conversation you have started with a supplier.'}
        >
          {user && (user.role === 'buyer' || user.role === 'seller') ? <HeroPill label={enquiries.length === 1 ? 'message' : 'messages'} value={enquiries.length} /> : null}
        </PageHero>
        {!user ? <View style={styles.panel}><Text style={styles.body}>Sign in to see enquiries linked to your account.</Text><Link href="/account" style={styles.link}>Sign in or register</Link></View> : null}
        {user && user.role === 'admin' ? <View style={styles.panel}><Text style={styles.body}>Administrator access is for review tasks. Enquiry access is limited to operational needs.</Text><Link href="/admin" style={styles.link}>Open administrator review</Link></View> : null}
        {user && (user.role === 'buyer' || user.role === 'seller') && loading ? <Text style={styles.body}>Loading enquiries…</Text> : null}
        {user && (user.role === 'buyer' || user.role === 'seller') && !loading && enquiries.length === 0 ? <View style={styles.panel}><Text style={styles.panelTitle}>No enquiries yet</Text><Text style={styles.body}>{user.role === 'seller' ? 'New buyer messages for your business will appear here.' : 'Your sent messages will appear here.'}</Text>{user.role === 'buyer' ? <Link href="/explore" style={styles.link}>Find suppliers</Link> : null}</View> : null}
        {enquiries.map((item) => <View key={item.id} style={styles.panel}>
          <View style={styles.row}><Text style={styles.panelTitle}>{item.listingTitle}</Text><Text style={styles.status}>{formatStatus(item.status)}</Text></View>
          <Text style={styles.body}>{user?.role === 'seller' ? `From ${item.buyerEmail ?? 'buyer'}` : `To ${item.businessName ?? 'supplier'}`}</Text>
          <Text style={styles.message}>{item.message}</Text>
          <Text style={styles.date}>{new Date(item.createdAt).toLocaleString()}</Text>
          <Link href={{ pathname: '/listing', params: { id: item.listingId } }} style={styles.link}>Open listing</Link>
          {user?.role === 'seller' && item.status !== 'closed' ? <View style={styles.actions}>
            {item.status === 'new' && <Pressable accessibilityRole="button" disabled={busyId === item.id} onPress={() => updateStatus(item.id, 'read')} style={styles.smallAction}><Text style={styles.smallActionText}>Mark read</Text></Pressable>}
            {(item.status === 'new' || item.status === 'read') && <Pressable accessibilityRole="button" disabled={busyId === item.id} onPress={() => updateStatus(item.id, 'responded')} style={styles.smallAction}><Text style={styles.smallActionText}>Mark responded</Text></Pressable>}
            <Pressable accessibilityRole="button" disabled={busyId === item.id} onPress={() => updateStatus(item.id, 'closed')} style={styles.smallAction}><Text style={styles.smallActionText}>Close</Text></Pressable>
          </View> : null}
        </View>)}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text accessibilityRole="status" style={styles.success}>{notice}</Text> : null}
      </View>
    </ScrollView>
  );
}

function formatStatus(status: string) { return status.replace(/^./, (value) => value.toUpperCase()); }

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
  error: { color: '#a23b32', fontSize: 12 },
  success: { color: '#236449', fontSize: 12 },
});