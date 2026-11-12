import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { HeroPill, PageHero } from '@/components/page-hero';
import { useSession } from '@/components/session-provider';
import { ApiError, getNotifications, markAllNotificationsRead, markNotificationRead, type AppNotification } from '@/lib/api';

// Only these in-app routes may be opened from a notification.
const allowedLinks = new Set(['/account', '/enquiries', '/help']);

const icons: Record<string, string> = {
  'verification.approved': '✅',
  'verification.rejected': '📝',
  'listing.published': '🌽',
  'listing.rejected': '📷',
  'enquiry.received': '💬',
};

export default function NotificationsScreen() {
  const { user } = useSession();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let current = true;
    getNotifications()
      .then((result) => { if (current) setItems(result.items); })
      .catch((cause: unknown) => { if (current) setError(cause instanceof ApiError ? cause.message : 'Notifications could not be loaded.'); });
    return () => { current = false; };
  }, [user]);

  const unread = items?.filter((item) => !item.readAt).length ?? 0;

  async function open(item: AppNotification) {
    if (!item.readAt) {
      setItems((current) => current?.map((entry) => (entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry)) ?? null);
      void markNotificationRead(item.id).catch(() => undefined);
    }
    if (item.link && allowedLinks.has(item.link)) router.push(item.link as Href);
  }

  async function readAll() {
    setBusy(true);
    setError('');
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((current) => current?.map((entry) => ({ ...entry, readAt: entry.readAt ?? now })) ?? null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Notifications could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.frame}>
        <PageHero eyebrow="NOTIFICATIONS" title="What's new" subtitle="Updates about your verification, your produce photos and buyer enquiries.">
          <HeroPill label="unread" value={unread} />
        </PageHero>

        {unread > 0 ? (
          <Pressable accessibilityRole="button" disabled={busy} onPress={readAll} style={[styles.readAll, busy && styles.disabled]}>
            <Text style={styles.readAllText}>{busy ? 'Updating…' : 'Mark all as read'}</Text>
          </Pressable>
        ) : null}

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {items === null && !error ? <Text style={styles.muted}>Loading notifications…</Text> : null}
        {items?.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon} accessible={false}>🔔</Text>
            <Text style={styles.title}>No notifications yet</Text>
            <Text style={styles.muted}>We will let you know here when your business is reviewed, when a photo is approved, or when a buyer sends you an enquiry.</Text>
          </View>
        ) : null}

        {items && items.length > 0 ? (
          <View style={styles.list}>
            {items.map((item, index) => {
              const isUnread = !item.readAt;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${isUnread ? 'Unread. ' : ''}${item.title}. ${item.body}`}
                  onPress={() => void open(item)}
                  style={[styles.item, index > 0 && styles.divider, isUnread && styles.unread]}
                >
                  <Text style={styles.icon} accessible={false}>{icons[item.type] ?? '🔔'}</Text>
                  <View style={styles.copy}>
                    <Text style={[styles.title, isUnread && styles.titleUnread]}>{item.title}</Text>
                    {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
                    <Text style={styles.date}>{timeAgo(item.createdAt)}</Text>
                  </View>
                  {isUnread ? <View style={styles.dot} accessible={false} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

function timeAgo(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(value).toLocaleDateString();
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120, backgroundColor: '#f3f5ed' },
  frame: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 14 },
  readAll: { alignSelf: 'flex-end', minHeight: 38, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#cbd5ca', backgroundColor: '#ffffff' },
  readAllText: { color: '#235946', fontSize: 13, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  list: { overflow: 'hidden', borderRadius: 18, borderWidth: 1, borderColor: '#e3e8de', backgroundColor: '#ffffff', boxShadow: '0 8px 28px rgba(24, 63, 50, 0.08)' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },
  divider: { borderTopWidth: 1, borderTopColor: '#edf0ea' },
  unread: { backgroundColor: '#f2f8ee' },
  icon: { fontSize: 22, lineHeight: 28 },
  copy: { flex: 1, gap: 4 },
  title: { color: '#183f32', fontSize: 14, fontWeight: '700', lineHeight: 20 },
  titleUnread: { fontWeight: '800' },
  body: { color: '#4d5d53', fontSize: 13, lineHeight: 19 },
  date: { color: '#78867d', fontSize: 11 },
  dot: { width: 10, height: 10, marginTop: 6, borderRadius: 5, backgroundColor: '#3d8b4f' },
  empty: { alignItems: 'center', gap: 8, padding: 28, borderRadius: 18, borderWidth: 1, borderColor: '#e3e8de', backgroundColor: '#ffffff' },
  emptyIcon: { fontSize: 32 },
  muted: { color: '#65736a', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  error: { color: '#a23b32', fontSize: 13 },
});
