import '@/global.css';
import { Redirect, Stack, useSegments } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import AppTabs from '@/components/app-tabs';
import { PrivacyGate } from '@/components/privacy-gate';
import { SessionProvider, useSession } from '@/components/session-provider';
import { getAuthRedirect } from '@/lib/auth-routing';

export default function RootLayout() {
  return (
    <SessionProvider>
      <AuthNavigation />
    </SessionProvider>
  );
}

function AuthNavigation() {
  const { status, user } = useSession();
  const segments = useSegments();
  const route = segments[0] ?? '';
  const redirect = getAuthRedirect(status, user?.role ?? null, route);

  if (status === 'loading') return <LoadingScreen />;
  if (redirect) return <Redirect href={redirect} />;
  // Accounts that have not accepted the current Privacy notice do so once, but can still read it first.
  if (status === 'signedIn' && user?.privacyAccepted === false && !['privacy', 'terms', 'help'].includes(route)) {
    return <PrivacyGate />;
  }

  const routes = <Stack screenOptions={{ headerShown: false }} />;
  return status === 'signedIn' ? <AppTabs>{routes}</AppTabs> : routes;
}

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <Text style={styles.brand}>AgriMarket</Text>
      <ActivityIndicator color="#235946" />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#f3f5ed' },
  brand: { color: '#183f32', fontSize: 24, fontWeight: '800' },
});
