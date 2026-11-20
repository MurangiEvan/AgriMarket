import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { StarRow, StarSummary } from '@/components/star-rating';
import { ApiError, buyerOrganisationLabel, getSellerRatings, reportRating, type SellerRatings } from '@/lib/api';

// The seller's own ratings: their average (even before it is public), the approved comments buyers
// wrote, and a way to report a comment they think is unfair.
export function SellerRatingsSection() {
  const [data, setData] = useState<SellerRatings | null>(null);
  const [reportingId, setReportingId] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [reported, setReported] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getSellerRatings().then((result) => { if (active) setData(result); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function sendReport(id: string) {
    setBusy(true);
    setError('');
    try {
      await reportRating(id, details.trim());
      setReported([...reported, id]);
      setReportingId('');
      setDetails('');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Your report could not be sent. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!data) return null;
  const remaining = Math.max(0, data.publicFrom - data.ratingCount);

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.title}>Your ratings</Text>
      {data.ratingCount === 0 ? (
        <Text style={styles.body}>No ratings yet. Buyers can rate you after you respond to their enquiry.</Text>
      ) : (
        <>
          <StarSummary average={data.ratingAverage} count={data.ratingCount} />
          <Text style={styles.body}>
            {data.isPublic
              ? 'Buyers see this average on your listings.'
              : `Buyers will see your average once you have ${data.publicFrom} ratings (${remaining} more to go).`}
          </Text>
          {data.pendingComments > 0 ? <Text style={styles.note}>{data.pendingComments} new comment{data.pendingComments === 1 ? ' is' : 's are'} waiting for an administrator.</Text> : null}
        </>
      )}
      {data.reviews.map((review) => (
        <View key={review.id} style={styles.review}>
          <StarRow stars={review.stars} />
          <Text style={styles.reviewText}>“{review.comment}”</Text>
          <Text style={styles.note}>{buyerOrganisationLabel(review.buyerType) || 'A buyer'} · {new Date(review.createdAt).toLocaleDateString()}</Text>
          {reported.includes(review.id) ? (
            <Text style={styles.success}>Reported. An administrator will review it.</Text>
          ) : reportingId === review.id ? (
            <View style={styles.reportForm}>
              <TextInput
                accessibilityLabel="Why is this rating unfair?"
                placeholder="Why is this rating unfair? e.g. we never dealt with this buyer."
                placeholderTextColor="#7a877f"
                multiline
                maxLength={1000}
                value={details}
                onChangeText={setDetails}
                style={styles.input}
              />
              <View style={styles.row}>
                <Pressable accessibilityRole="button" disabled={busy} onPress={() => void sendReport(review.id)} style={busy ? styles.reportBusy : styles.report}>
                  <Text style={styles.reportText}>{busy ? 'Sending…' : 'Send report'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setReportingId('')} style={styles.cancel}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setReportingId(review.id)} hitSlop={6}>
              <Text style={styles.reportLink}>Report this rating</Text>
            </Pressable>
          )}
        </View>
      ))}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const button = { minHeight: 40, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 5 } as const;

const styles = StyleSheet.create({
  section: { marginTop: 18, padding: 22, gap: 10, borderWidth: 1, borderColor: '#e3e8de', borderRadius: 20, backgroundColor: '#ffffff' },
  title: { color: '#183f32', fontFamily: 'Georgia', fontSize: 23, lineHeight: 29 },
  body: { color: '#40554a', fontSize: 13, lineHeight: 20 },
  note: { color: '#78867d', fontSize: 11, lineHeight: 16 },
  review: { gap: 4, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#e3e8de', backgroundColor: '#fffefa' },
  reviewText: { color: '#364b3e', fontSize: 14, lineHeight: 21 },
  reportLink: { color: '#a23b32', fontSize: 11, fontWeight: '700', textDecorationLine: 'underline' },
  reportForm: { gap: 8, marginTop: 4 },
  input: { minHeight: 70, padding: 10, borderWidth: 1, borderColor: '#cbd5ca', borderRadius: 5, color: '#183f32', backgroundColor: '#ffffff', textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  report: { ...button, backgroundColor: '#a23b32' },
  reportBusy: { ...button, backgroundColor: '#a23b32', opacity: 0.5 },
  reportText: { color: '#fffefa', fontSize: 12, fontWeight: '800' },
  cancel: { ...button, borderWidth: 1, borderColor: '#cbd5ca' },
  cancelText: { color: '#235946', fontSize: 12, fontWeight: '800' },
  success: { color: '#236449', fontSize: 12 },
  error: { color: '#a23b32', fontSize: 12 },
});
