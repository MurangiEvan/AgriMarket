import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BackButton } from '@/components/back-button';
import { PageHero } from '@/components/page-hero';
import { useSession } from '@/components/session-provider';

export type LegalSection = { heading: string; paragraphs?: string[]; bullets?: string[] };

// Shared layout for the Privacy notice and Terms of use: readable before sign-up and while signed in.
export function LegalDocument({ eyebrow, title, subtitle, updated, sections }: {
  eyebrow: string;
  title: string;
  subtitle: string;
  updated: string;
  sections: LegalSection[];
}) {
  const { user } = useSession();
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.frame}>
        {!user ? <BackButton fallback="/sign-up" /> : null}
        <PageHero eyebrow={eyebrow} title={title} subtitle={subtitle} />
        <Text style={styles.updated}>Last updated {updated}</Text>
        {sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text accessibilityRole="header" style={styles.heading}>{section.heading}</Text>
            {section.paragraphs?.map((paragraph) => <Text key={paragraph} style={styles.body}>{paragraph}</Text>)}
            {section.bullets?.map((bullet) => (
              <View key={bullet} style={styles.bulletRow}>
                <Text style={styles.bulletMark}>•</Text>
                <Text style={styles.bulletText}>{bullet}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 120, backgroundColor: '#f3f5ed' },
  frame: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: 14 },
  updated: { color: '#65736a', fontSize: 12 },
  section: { gap: 8, padding: 18, borderRadius: 12, borderWidth: 1, borderColor: '#d8ded4', backgroundColor: '#fffefa' },
  heading: { color: '#183f32', fontFamily: 'Georgia', fontSize: 20, lineHeight: 26 },
  body: { color: '#364b3e', fontSize: 14, lineHeight: 22 },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bulletMark: { color: '#235946', fontSize: 14, lineHeight: 22, fontWeight: '800' },
  bulletText: { flex: 1, color: '#364b3e', fontSize: 14, lineHeight: 22 },
});
