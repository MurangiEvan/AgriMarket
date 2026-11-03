import { ListingBrowser } from '@/components/listing-browser';
import { MarketFlow } from '@/components/market-flow';
import { useSession } from '@/components/session-provider';

export default function HomeScreen() {
  const { user } = useSession();
  if (user?.role === 'buyer') return <MarketFlow />;
  return <ListingBrowser />;
}
