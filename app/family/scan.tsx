import React, { useEffect, useState } from 'react';
import { Alert, Platform, StyleSheet } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';

// Lazy-loaded scanner component to avoid requiring native module during route scan
let LoadedScanner: any = null;

export default function FamilyScanScreen() {
  const router = useRouter();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (Platform.OS === 'web') {
        setHasPermission(false);
        setReady(true);
        return;
      }
      try {
        // Dynamically import to avoid native require at route load time
        const mod = await import('expo-barcode-scanner');
        LoadedScanner = mod.BarCodeScanner;
        const { status } = await mod.BarCodeScanner.requestPermissionsAsync();
        setHasPermission(status === 'granted');
        setReady(true);
      } catch (e) {
        setHasPermission(false);
        setReady(true);
      }
    })();
  }, []);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    try {
      const url = new URL(data);
      if (url.pathname.includes('join') || url.protocol.startsWith('test:')) {
        const hid = url.searchParams.get('hid') || '';
        const t = url.searchParams.get('t') || '';
        if (t) {
          router.replace({ pathname: '/join', params: { hid, t } } as any);
          return;
        }
      }
      Alert.alert('Không hợp lệ', 'Mã QR không phải lời mời gia đình');
      setScanned(false);
    } catch {
      Alert.alert('Lỗi', 'Không đọc được mã');
      setScanned(false);
    }
  };

  if (!ready) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Đang chuẩn bị máy quét…</ThemedText>
      </ThemedView>
    );
  }

  if (hasPermission === false) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>{Platform.OS === 'web' ? 'Trình duyệt không hỗ trợ quét QR' : 'Không có quyền camera'}</ThemedText>
      </ThemedView>
    );
  }

  const Scanner = LoadedScanner;

  return (
    <ThemedView style={{ flex: 1 }}>
      {Scanner ? (
        <Scanner onBarCodeScanned={handleBarCodeScanned} style={{ flex: 1 }} />
      ) : (
        <ThemedView style={styles.center}>
          <ThemedText>Không thể tải máy quét</ThemedText>
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
