import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError, cancelAccountDeletion, getDeletionRequest, requestAccountDeletion, type DeletionRequest } from '@/lib/api';

// POPIA: users ask for their account to be deleted; an administrator checks for open reports or
// disputes and then approves it. The user can cancel while the request is still waiting.
export function DeleteAccountSection() {
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getDeletionRequest()
      .then((latest) => { if (active) { setRequest(latest); setLoaded(true); } })
      .catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      setRequest(await requestAccountDeletion(reason.trim()));
      setOpen(false);
      setReason('');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Your request could not be sent. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setError('');
    try {
      await cancelAccountDeletion();
      setRequest(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Your request could not be cancelled. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return null;
  const pending = request?.status === 'pending';

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>Delete my account</Text>

      {pending ? (
        <>
          <View style={styles.waiting}>
            <Text style={styles.waitingTitle}>Deletion requested</Text>
            <Text style={styles.body}>An administrator will review your request and delete your account. You can keep using AgriMarket until then, or cancel the request.</Text>
          </View>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void cancel()} style={busy ? styles.secondaryBusy : styles.secondary}>
            <Text style={styles.secondaryText}>{busy ? 'Cancelling…' : 'Cancel deletion request'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          {request?.status === 'rejected' ? (
            <View style={styles.rejected}>
              <Text style={styles.waitingTitle}>Your last request was not approved</Text>
              <Text style={styles.body}>{request.decisionNote ? `Administrator note: ${request.decisionNote}` : 'Contact support for more information.'}</Text>
            </View>
          ) : null}
          <Text style={styles.body}>
            Deleting removes your name, email, password, location, business contact details, documents and photos, and takes your listings down. Messages you exchanged stay with the other business, marked as from a deleted user. Read the <Link href="/privacy" style={styles.inlineLink}>Privacy notice</Link> for details.
          </Text>
          {open ? (
            <>
              <TextInput
                accessibilityLabel="Reason for deleting your account (optional)"
                placeholder="Why are you leaving? (optional)"
                placeholderTextColor="#7a877f"
                multiline
                maxLength={1000}
                value={reason}
                onChangeText={setReason}
                style={styles.input}
              />
              <View style={styles.row}>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void submit()} style={busy ? styles.dangerBusy : styles.danger}>
                  <Text style={styles.dangerText}>{busy ? 'Sending…' : 'Ask to delete my account'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={styles.secondary}>
                  <Text style={styles.secondaryText}>Keep my account</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.secondary}>
              <Text style={styles.dangerLink}>I want to delete my account</Text>
            </Pressable>
          )}
        </>
      )}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const button = { minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 5 } as const;

const styles = StyleSheet.create({
  section: { marginTop: 18, padding: 22, gap: 12, borderWidth: 1, borderColor: '#efc9bf', borderRadius: 20, backgroundColor: '#ffffff' },
  title: { color: '#183f32', fontFamily: 'Georgia', fontSize: 21, lineHeight: 27 },
  body: { color: '#40554a', fontSize: 13, lineHeight: 20 },
  inlineLink: { color: '#235946', fontWeight: '800', textDecorationLine: 'underline' },
  waiting: { gap: 4, padding: 12, borderRadius: 10, backgroundColor: '#fdf1cf' },
  rejected: { gap: 4, padding: 12, borderRadius: 10, backgroundColor: '#fbeae5' },
  waitingTitle: { color: '#183f32', fontSize: 14, fontWeight: '800' },
  input: { minHeight: 80, padding: 10, borderWidth: 1, borderColor: '#cbd5ca', borderRadius: 5, color: '#183f32', backgroundColor: '#fffefa', textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  danger: { ...button, backgroundColor: '#a23b32' },
  dangerBusy: { ...button, backgroundColor: '#a23b32', opacity: 0.5 },
  dangerText: { color: '#fffefa', fontSize: 14, fontWeight: '800' },
  dangerLink: { color: '#a23b32', fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  secondary: { ...button, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#cbd5ca' },
  secondaryBusy: { ...button, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#cbd5ca', opacity: 0.5 },
  secondaryText: { color: '#235946', fontSize: 13, fontWeight: '800' },
  error: { color: '#a23b32', fontSize: 12, lineHeight: 18 },
});
