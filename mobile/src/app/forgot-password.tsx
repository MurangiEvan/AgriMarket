import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function ForgotPasswordScreen() {
  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.title}>Reset your password</Text>
        <Text style={styles.body}>Password reset is not available until AgriMarket email delivery is configured. No reset email has been sent.</Text>
        <Link href="/sign-in" style={styles.link}>Return to sign in</Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#f3f5ed' },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 16, padding: 26, borderRadius: 18, backgroundColor: '#fff' },
  title: { color: '#183f32', fontSize: 28, fontWeight: '800' },
  body: { color: '#40554a', fontSize: 15, lineHeight: 22 },
  link: { color: '#235946', fontWeight: '700', textDecorationLine: 'underline' },
});
