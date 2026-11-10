import { Image } from 'expo-image';
import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function greeting(now = new Date()) {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

// Photo banner used at the top of the signed-in pages so they share one look with the sign-in screen.
export function PageHero({
  eyebrow,
  title,
  subtitle,
  children,
}: PropsWithChildren<{ eyebrow: string; title: string; subtitle?: string }>) {
  return (
    <View style={styles.hero}>
      <Image source={require('@/assets/images/login/market-background.jpg')} contentFit="cover" style={StyleSheet.absoluteFill} accessible={false} />
      <View style={styles.shade} />
      <View style={styles.content}>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {children ? <View style={styles.side}>{children}</View> : null}
      </View>
    </View>
  );
}

export function HeroPill({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillValue}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { minHeight: 176, overflow: 'hidden', borderRadius: 22, backgroundColor: '#183f32', boxShadow: '0 12px 32px rgba(24, 63, 50, 0.22)' },
  shade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(14, 40, 28, 0.62)' },
  content: { flex: 1, padding: 24, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 },
  copy: { flexGrow: 1, flexShrink: 1, flexBasis: 260, gap: 6 },
  eyebrow: { color: '#f4c76b', fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: '#ffffff', fontFamily: 'Georgia', fontSize: 32, lineHeight: 38 },
  subtitle: { maxWidth: 520, color: 'rgba(255, 255, 255, 0.88)', fontSize: 14, lineHeight: 21 },
  side: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  pill: { minWidth: 88, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.35)', backgroundColor: 'rgba(255, 255, 255, 0.14)' },
  pillValue: { color: '#ffffff', fontSize: 22, fontWeight: '800' },
  pillLabel: { color: 'rgba(255, 255, 255, 0.85)', fontSize: 11, fontWeight: '700' },
});
