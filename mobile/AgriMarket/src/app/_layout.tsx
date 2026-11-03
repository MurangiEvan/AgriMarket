import React, { useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { router, Slot } from 'expo-router';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { authService, User } from '@/services/auth';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const currentUser = await authService.getMe();
        setUser(currentUser);
      } catch (e) {
        setUser(null);
      } finally {
        setIsLoading(false);
        SplashScreen.hideAsync();
      }
    }

    checkAuth();
  }, []);

  if (isLoading) {
    return <AnimatedSplashOverlay />;
  }

  // Route Guard: If not logged in and not trying to access auth screens, redirect to login
  // Note: Expo Router handles nested routes. We check the current path.
  // In a real app, we'd use a more robust way to determine if the current route is in (auth)

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {user ? <AppTabs /> : <Slot />}
    </ThemeProvider>
  );
}
