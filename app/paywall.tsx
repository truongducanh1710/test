import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getCurrentHouseholdId } from '@/lib/family';
import { assertHouseholdNotPro, getEntitlement, isPro, startTrial } from '@/lib/subscription';

export default function PaywallScreen() {
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');

  const [loading, setLoading] = useState(true);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [pro, setPro] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const hid = await getCurrentHouseholdId();
        setHouseholdId(hid);
        if (hid) {
          const ent = await getEntitlement(hid);
          setPro(isPro(ent));
        }
      } catch (e: any) {
        Alert.alert('Lỗi', e?.message || 'Không thể tải quyền hiện tại');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onStartTrial = async () => {
    if (!householdId) {
      Alert.alert('Chưa có gia đình', 'Hãy tạo hoặc chọn gia đình trước');
      return;
    }
    try {
      setLoading(true);
      // Guard: chặn nếu household đã có Pro
      await assertHouseholdNotPro(householdId);
      await startTrial(householdId);
      Alert.alert('Thành công', 'Đã kích hoạt dùng thử 7 ngày cho gia đình');
      const ent = await getEntitlement(householdId);
      setPro(isPro(ent));
    } catch (e: any) {
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('household_already_pro')) {
        Alert.alert('Đang có Pro', 'Gia đình đã có Pro đang hoạt động.');
      } else if (msg.includes('trial_already_used')) {
        Alert.alert('Đã dùng thử', 'Gia đình đã sử dụng dùng thử trước đó.');
      } else if (msg.includes('permission_denied')) {
        Alert.alert('Không có quyền', 'Bạn cần là thành viên của gia đình này.');
      } else {
        Alert.alert('Lỗi', e?.message || 'Không thể kích hoạt dùng thử');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color={tint} />
      ) : (
        <>
          <ThemedText type="title" style={{ marginBottom: 8 }}>Nâng cấp Pro</ThemedText>
          <ThemedText style={{ opacity: 0.8, marginBottom: 16 }}>
            Dùng thử 7 ngày tất cả tính năng Nâng cao. Không cần thẻ. Hết 7 ngày sẽ tự khóa nếu bạn không đăng ký.
          </ThemedText>

          <ThemedView style={styles.card}>
            <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Bạn nhận được</ThemedText>
            <ThemedText>• AI Advisor nâng cao (tối đa 200 phân tích/household/tháng)</ThemedText>
            <ThemedText>• Báo cáo nâng cao theo người, theo danh mục sâu</ThemedText>
            <ThemedText>• Xuất CSV/Excel và backup định kỳ</ThemedText>
            <ThemedText>• Ngân sách nâng cao + cảnh báo, mục tiêu tiết kiệm</ThemedText>
          </ThemedView>

          {!pro && (
            <Pressable style={[styles.button, { backgroundColor: tint }]} onPress={onStartTrial}>
              <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Dùng thử 7 ngày</ThemedText>
            </Pressable>
          )}

          {pro && (
            <ThemedText style={{ color: tint, marginTop: 12 }}>Gia đình bạn đang ở trạng thái Pro/Grace</ThemedText>
          )}
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  card: { padding: 16, borderRadius: 12, marginBottom: 16 },
  button: { paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
});




