import { Link } from 'expo-router';
import { Text, View } from 'react-native';

import { MarketFlow } from '@/components/market-flow';
import { useSession } from '@/components/session-provider';

export default function MarketScreen() {
  const { user, loading } = useSession();
  if (loading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text>Checking your account…</Text></View>;
  if (user?.role !== 'buyer') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <Text accessibilityRole="header" style={{ color: '#183f32', fontSize: 24, fontWeight: '800' }}>Buyer sign-in required</Text>
        <Text style={{ color: '#40554a', textAlign: 'center' }}>Sign in with a buyer account to find produce near you.</Text>
        <Link href="/account" style={{ color: '#235946', fontWeight: '800', textDecorationLine: 'underline' }}>Open your account</Link>
      </View>
    );
  }
  return <MarketFlow />;
}
