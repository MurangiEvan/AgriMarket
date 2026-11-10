import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

// Goes to the previous screen, or to `fallback` when there is no history (e.g. a page opened from a link).
export function goBack(fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

export function BackButton({
  fallback,
  label = 'Back',
  variant = 'link',
  dark = false,
  style,
}: {
  fallback: Href;
  label?: string;
  variant?: 'link' | 'floating';
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === 'Back' ? 'Go back' : label}
      hitSlop={8}
      onPress={() => goBack(fallback)}
      style={[variant === 'floating' ? styles.floating : styles.link, variant === 'floating' && dark && styles.floatingDark, style]}
    >
      <Text style={[styles.text, variant === 'floating' && styles.floatingText]}>← {label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'flex-start', paddingVertical: 4 },
  text: { color: '#235946', fontSize: 14, fontWeight: '800' },
  floating: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderWidth: 1, borderColor: '#d8ded4', borderRadius: 8, backgroundColor: 'rgba(248, 249, 244, 0.97)' },
  floatingDark: { backgroundColor: '#243229' },
  floatingText: { fontSize: 15 },
});
