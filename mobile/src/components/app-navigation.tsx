import { Link, usePathname } from 'expo-router';
import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/back-button';
import { useSession } from '@/components/session-provider';
import { getUnreadNotificationCount } from '@/lib/api';

type AppThemeValue = { isDark: boolean; toggleTheme: () => void };

const AppThemeContext = createContext<AppThemeValue | null>(null);

export function useAppTheme() {
  const context = useContext(AppThemeContext);
  if (!context) throw new Error('useAppTheme must be used within AppNavigation.');
  return context;
}

const destinations = [
  { href: '/', label: 'Home', mark: '⌂' },
  { href: '/explore', label: 'Search', mark: '⌕' },
  { href: '/market', label: 'Near me', mark: '◎' },
  { href: '/enquiries', label: 'Enquiries', mark: '↗' },
  { href: '/account', label: 'Profile', mark: '◯' },
] as const;

export default function AppNavigation({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const colorScheme = useColorScheme();
  // Android draws the app behind the status bar (clock, battery). Push the page and the
  // floating top buttons below it; on the web this is 0.
  const { top: statusBarHeight } = useSafeAreaInsets();
  const { user, loading, offline, error: sessionError, signOut } = useSession();
  const [themeOverride, setThemeOverride] = useState<boolean | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const isDark = themeOverride ?? colorScheme === 'dark';
  const visibleDestinations = destinations.filter((destination) => destination.href !== '/market' || user?.role === 'buyer');
  const home = user?.role === 'buyer' ? '/market' : user?.role === 'seller' ? '/account' : user?.role === 'admin' ? '/admin' : '/';
  // Every page except the role's home (and the landing page) gets a back button.
  const showBack = pathname !== home && pathname !== '/';

  // Sellers get notifications (verification, photo and enquiry updates). The badge refreshes
  // whenever the page changes and once a minute while the app is open.
  const showBell = user?.role === 'seller';
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    if (!showBell || offline) return;
    let current = true;
    const refresh = () => {
      getUnreadNotificationCount()
        .then((count) => { if (current) setUnreadCount(count); })
        .catch(() => undefined);
    };
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [showBell, offline, pathname]);

  function toggleTheme() {
    setThemeOverride(!isDark);
  }

  return (
    <AppThemeContext.Provider value={{ isDark, toggleTheme }}>
      <View style={[styles.shell, { paddingTop: statusBarHeight }]}>
        {offline ? <View accessibilityRole="alert" style={styles.offlineBanner}><Text style={styles.offlineText}>Offline — showing the last signed-in app shell. Changes are unavailable.</Text></View> : null}
        {sessionError ? <View accessibilityRole="alert" style={styles.errorBanner}><Text style={styles.errorText}>{sessionError}</Text></View> : null}
        {showBack ? <View style={styles.backBar}><BackButton fallback={home} variant="floating" /></View> : null}
        <View style={styles.content}>{children}</View>
        {showBell ? (
          <Link href="/notifications" asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
              style={StyleSheet.flatten([styles.bellButton, { top: statusBarHeight + 14 }])}
            >
              <Text style={styles.bellMark}>🔔</Text>
              {unreadCount > 0 ? (
                <View style={styles.badge} accessible={false}>
                  <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </Link>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionsOpen ? 'Close app bar' : 'Open app bar'}
          accessibilityState={{ expanded: actionsOpen }}
          onPress={() => setActionsOpen((open) => !open)}
          style={[styles.menuButton, { top: statusBarHeight + 14 }]}
        >
          <Text style={styles.actionMark}>{actionsOpen ? '×' : '☰'}</Text>
        </Pressable>
        {actionsOpen && (
          <View accessibilityRole="toolbar" accessibilityLabel="Appearance and account" style={StyleSheet.flatten([styles.actionPanel, { top: statusBarHeight + 66 }, isDark && styles.actionRailDark])}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              onPress={() => { toggleTheme(); setActionsOpen(false); }}
              style={StyleSheet.flatten([styles.actionButton, isDark && styles.actionButtonDark])}
            >
              <Text style={styles.actionMark}>{isDark ? '☀' : '☾'}</Text>
              <Text style={StyleSheet.flatten([styles.actionText, isDark && styles.actionTextDark])}>{isDark ? 'Light mode' : 'Dark mode'}</Text>
            </Pressable>
            <Link href="/help" asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Help and support"
                onPress={() => setActionsOpen(false)}
                style={StyleSheet.flatten([styles.actionButton, isDark && styles.actionButtonDark])}
              >
                <Text style={styles.actionMark}>?</Text>
                <Text style={StyleSheet.flatten([styles.actionText, isDark && styles.actionTextDark])}>Help & support</Text>
              </Pressable>
            </Link>
            {loading ? (
              <View style={styles.actionButton}>
                <Text style={styles.actionMark}>…</Text>
                <Text style={styles.actionText}>Checking</Text>
              </View>
            ) : user ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                onPress={() => { setActionsOpen(false); void signOut().catch(() => undefined); }}
                style={StyleSheet.flatten([styles.actionButton, isDark && styles.actionButtonDark])}
              >
                <Text style={styles.actionMark}>↪</Text>
                <Text style={StyleSheet.flatten([styles.actionText, isDark && styles.actionTextDark])}>Sign out</Text>
              </Pressable>
            ) : (
              <Link href="/sign-in" asChild>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel="Sign in"
                  onPress={() => setActionsOpen(false)}
                  style={StyleSheet.flatten([styles.actionButton, isDark && styles.actionButtonDark])}
                >
                  <Text style={styles.actionMark}>↗</Text>
                  <Text style={StyleSheet.flatten([styles.actionText, isDark && styles.actionTextDark])}>Sign in</Text>
                </Pressable>
              </Link>
            )}
          </View>
        )}
        <View accessibilityRole="toolbar" accessibilityLabel="Main navigation" style={styles.navOuter}>
          <View style={styles.nav}>
            {visibleDestinations.map((destination) => {
              const active = pathname === destination.href || (destination.href !== '/' && pathname.startsWith(destination.href));
              return (
                <Link key={destination.href} href={destination.href} asChild>
                  <Pressable
                    accessibilityRole="link"
                    accessibilityLabel={destination.label}
                    accessibilityState={{ selected: active }}
                    style={StyleSheet.flatten([styles.navItem, active && styles.navItemActive])}>
                    <Text style={[styles.navMark, active && styles.navTextActive]}>{destination.mark}</Text>
                    <Text style={[styles.navText, active && styles.navTextActive]}>{destination.label}</Text>
                  </Pressable>
                </Link>
              );
            })}
          </View>
        </View>
      </View>
    </AppThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, minHeight: '100%', backgroundColor: '#f3f5ed' },
  // Pages scroll behind the floating menu; each page pads its own bottom so nothing is hidden.
  content: { flex: 1 },
  backBar: { paddingTop: 14, paddingLeft: 12, paddingRight: 120, paddingBottom: 2, alignItems: 'flex-start' },
  bellButton: { position: 'absolute' as never, top: 14, right: 64, zIndex: 21, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#d8ded4', borderRadius: 8, backgroundColor: 'rgba(248, 249, 244, 0.97)' },
  bellMark: { fontSize: 19, lineHeight: 24 },
  badge: { position: 'absolute' as never, top: -6, right: -6, minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 2, borderColor: '#f8f9f4', backgroundColor: '#c0392b' },
  badgeText: { color: '#ffffff', fontSize: 10, fontWeight: '800', lineHeight: 13 },
  offlineBanner: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#f4e3b2' },
  offlineText: { color: '#3e3217', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  errorBanner: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#f7dede' },
  errorText: { color: '#762020', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  menuButton: { position: 'absolute' as never, top: 14, right: 12, zIndex: 21, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#d8ded4', borderRadius: 8, backgroundColor: 'rgba(248, 249, 244, 0.97)' },
  actionPanel: { position: 'absolute' as never, top: 66, right: 12, zIndex: 20, width: 180, alignItems: 'stretch', gap: 8, padding: 10, borderWidth: 1, borderColor: '#d8ded4', borderRadius: 8, backgroundColor: 'rgba(248, 249, 244, 0.97)' },
  actionRailDark: { borderColor: '#3a4d43', backgroundColor: 'rgba(29, 42, 36, 0.97)' },
  actionButton: { width: '100%', minHeight: 46, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 10, borderRadius: 6, backgroundColor: '#e4eadf' },
  actionButtonDark: { backgroundColor: '#243229' },
  actionMark: { color: '#235946', fontSize: 20, lineHeight: 24 },
  actionText: { color: '#183f32', fontSize: 9, fontWeight: '700', textAlign: 'center' },
  actionTextDark: { color: '#f3f5ed' },
  navOuter: { position: 'fixed' as never, left: 0, right: 0, bottom: 0, zIndex: 10, paddingHorizontal: 12, paddingBottom: 10 },
  nav: { width: '100%', maxWidth: 640, minHeight: 66, alignSelf: 'center', paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', gap: 4, borderRadius: 24, borderWidth: 1, borderColor: '#e3e8de', backgroundColor: 'rgba(255, 255, 255, 0.98)', boxShadow: '0 10px 30px rgba(24, 63, 50, 0.16)' },
  navItem: { minWidth: 64, minHeight: 50, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 18, gap: 2 },
  navItemActive: { backgroundColor: '#235946' },
  navMark: { color: '#65736a', fontSize: 21, lineHeight: 25 },
  navText: { color: '#65736a', fontSize: 11, fontWeight: '600' },
  navTextActive: { color: '#ffffff' },
});