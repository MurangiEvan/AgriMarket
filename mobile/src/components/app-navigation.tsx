import { Link, usePathname } from 'expo-router';
import { createContext, useContext, useState, type PropsWithChildren } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { useSession } from '@/components/session-provider';

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
  const { user, loading, offline, error: sessionError, signOut } = useSession();
  const [themeOverride, setThemeOverride] = useState<boolean | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const isDark = themeOverride ?? colorScheme === 'dark';
  const visibleDestinations = destinations.filter((destination) => destination.href !== '/market' || user?.role === 'buyer');

  function toggleTheme() {
    setThemeOverride(!isDark);
  }

  return (
    <AppThemeContext.Provider value={{ isDark, toggleTheme }}>
      <View style={StyleSheet.flatten([styles.shell, isDark && styles.shellDark])}>
        {offline ? <View accessibilityRole="alert" style={styles.offlineBanner}><Text style={styles.offlineText}>Offline — showing the last signed-in app shell. Changes are unavailable.</Text></View> : null}
        {sessionError ? <View accessibilityRole="alert" style={styles.errorBanner}><Text style={styles.errorText}>{sessionError}</Text></View> : null}
        <View style={styles.content}>{children}</View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionsOpen ? 'Close app bar' : 'Open app bar'}
          accessibilityState={{ expanded: actionsOpen }}
          onPress={() => setActionsOpen((open) => !open)}
          style={StyleSheet.flatten([styles.menuButton, isDark && styles.actionButtonDark])}
        >
          <Text style={styles.actionMark}>{actionsOpen ? '×' : '☰'}</Text>
        </Pressable>
        {actionsOpen && (
          <View accessibilityRole="toolbar" accessibilityLabel="Appearance and account" style={StyleSheet.flatten([styles.actionPanel, isDark && styles.actionRailDark])}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              onPress={() => { toggleTheme(); setActionsOpen(false); }}
              style={StyleSheet.flatten([styles.actionButton, isDark && styles.actionButtonDark])}
            >
              <Text style={styles.actionMark}>{isDark ? '☀' : '☾'}</Text>
              <Text style={StyleSheet.flatten([styles.actionText, isDark && styles.actionTextDark])}>{isDark ? 'Light mode' : 'Dark mode'}</Text>
            </Pressable>
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
  shellDark: { backgroundColor: '#121613' },
  content: { flex: 1, paddingBottom: 78 },
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
  navOuter: { position: 'fixed' as never, left: 0, right: 0, bottom: 0, zIndex: 10, borderTopWidth: 1, borderTopColor: '#d8ded4', backgroundColor: 'rgba(248, 249, 244, 0.97)' },
  nav: { width: '100%', maxWidth: 1120, minHeight: 72, alignSelf: 'center', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  navItem: { minWidth: 62, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 12, gap: 2 },
  navItemActive: { backgroundColor: '#e4eadf' },
  navMark: { color: '#65736a', fontSize: 21, lineHeight: 25 },
  navText: { color: '#65736a', fontSize: 11, fontWeight: '600' },
  navTextActive: { color: '#183f32' },
});