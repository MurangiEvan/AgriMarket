import { Pressable, StyleSheet, Text, View } from 'react-native';

const GOLD = '#c98a12';

// Read-only stars, e.g. "★★★★☆ 4.2 (12)". Shows nothing when there is no public average yet.
export function StarSummary({ average, count, compact = false }: { average: number | null | undefined; count?: number; compact?: boolean }) {
  if (average === null || average === undefined) return null;
  const rounded = Math.round(average);
  return (
    <View style={styles.summary} accessible accessibilityLabel={`Rated ${average} out of 5 by ${count ?? 0} buyers`}>
      <Text style={compact ? styles.starsSmall : styles.stars}>{'★'.repeat(rounded)}{'☆'.repeat(5 - rounded)}</Text>
      <Text style={compact ? styles.labelSmall : styles.label}>{average.toFixed(1)}{count !== undefined ? ` (${count})` : ''}</Text>
    </View>
  );
}

export function StarRow({ stars }: { stars: number }) {
  return <Text style={styles.starsSmall} accessibilityLabel={`${stars} out of 5 stars`}>{'★'.repeat(stars)}{'☆'.repeat(5 - stars)}</Text>;
}

// Tappable 1–5 stars for rating a supplier.
export function StarPicker({ value, onChange }: { value: number; onChange: (stars: number) => void }) {
  return (
    <View style={styles.picker} accessibilityRole="radiogroup" accessibilityLabel="Your rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable
          key={star}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === star }}
          accessibilityLabel={`${star} star${star === 1 ? '' : 's'}`}
          hitSlop={6}
          onPress={() => onChange(star)}
          style={styles.pickerStar}
        >
          <Text style={star <= value ? styles.pickerOn : styles.pickerOff}>{star <= value ? '★' : '☆'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stars: { color: GOLD, fontSize: 16, letterSpacing: 1 },
  starsSmall: { color: GOLD, fontSize: 13, letterSpacing: 1 },
  label: { color: '#40554a', fontSize: 13, fontWeight: '800' },
  labelSmall: { color: '#40554a', fontSize: 11, fontWeight: '800' },
  picker: { flexDirection: 'row', gap: 4 },
  pickerStar: { minWidth: 40, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  pickerOn: { color: GOLD, fontSize: 30 },
  pickerOff: { color: '#aab6ab', fontSize: 30 },
});
