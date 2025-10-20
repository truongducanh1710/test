import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { Provider as PaperProvider } from 'react-native-paper';

import { useColorScheme } from '@/hooks/use-color-scheme';
import React, { useEffect, useState } from 'react';
import { getSession } from '@/lib/auth';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    (async () => {
      const session = await getSession();
      const inAuth = segments.includes('auth');
      if (!session && !inAuth) router.replace('/auth');
      setAuthReady(true);
    })();
  }, [segments, router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <PaperProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="family/index" options={{ title: 'Gia đình' }} />
          <Stack.Screen name="settings/index" options={{ title: 'Cài đặt' }} />
          <Stack.Screen name="join" options={{ headerTitle: 'Tham gia gia đình' }} />
          <Stack.Screen name="reset-password" options={{ headerTitle: 'Đặt lại mật khẩu' }} />
          <Stack.Screen name="paywall" options={{ title: 'Nâng cấp Pro' }} />
        </Stack>
        <StatusBar style="auto" />
      </PaperProvider>
    </ThemeProvider>
  );
}
