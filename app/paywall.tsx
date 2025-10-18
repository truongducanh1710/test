import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, ActivityIndicator, View, Image, ScrollView } from 'react-native';
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

  const PriceTag = () => (
    <View style={styles.priceRow}>
      <View style={[styles.priceChip, { borderColor: tint }]}>
        <ThemedText style={{ color: tint, fontWeight: '700' }}>99.000₫/tháng</ThemedText>
      </View>
      <View style={[styles.priceChip, { borderColor: tint }]}>
        <ThemedText style={{ color: tint, fontWeight: '700' }}>949.000₫/năm</ThemedText>
        <ThemedText style={{ color: tint, marginLeft: 6 }}>(-20%)</ThemedText>
      </View>
    </View>
  );

  const Benefit = ({ label }: { label: string }) => (
    <View style={styles.benefitRow}>
      <View style={[styles.bullet, { backgroundColor: tint }]} />
      <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color={tint} />
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <View style={styles.hero}>
            <Image source={require('@/assets/images/react-logo.png')} style={{ width: 64, height: 64, opacity: 0.85 }} />
            <ThemedText type="title" style={{ marginTop: 10 }}>Nâng cấp Pro</ThemedText>
            <ThemedText style={{ opacity: 0.8, textAlign: 'center', marginTop: 6 }}>
              Dùng thử 7 ngày tất cả tính năng Nâng cao. Không cần thẻ. Hết 7 ngày sẽ tự khóa nếu bạn không đăng ký.
            </ThemedText>
          </View>

          {/* Benefits */}
          <ThemedView style={styles.card}>
            <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Bạn nhận được</ThemedText>
            <Benefit label="AI Advisor nâng cao (tối đa 200 phân tích/household/tháng)" />
            <Benefit label="Báo cáo nâng cao theo người, danh mục sâu, lọc tùy chỉnh" />
            <Benefit label="Xuất CSV/Excel và backup tự động" />
            <Benefit label="Ngân sách nâng cao + cảnh báo, mục tiêu tiết kiệm" />
          </ThemedView>

          {/* Pricing */}
          <ThemedView style={styles.card}>
            <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Giá</ThemedText>
            <PriceTag />
          </ThemedView>

          {/* CTA */}
          {!pro ? (
            <Pressable style={[styles.cta, { backgroundColor: tint }]} onPress={onStartTrial}>
              <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Dùng thử 7 ngày</ThemedText>
            </Pressable>
          ) : (
            <ThemedText style={{ color: tint, marginTop: 12, textAlign: 'center' }}>Gia đình bạn đang ở trạng thái Pro/Grace</ThemedText>
          )}

          {/* Footer */}
          <ThemedText style={{ opacity: 0.6, marginTop: 12, fontSize: 12, textAlign: 'center' }}>
            Quyền Pro áp dụng cho cả hộ gia đình. Trial không tự gia hạn. Bạn có thể khôi phục mua hàng trong Cài đặt.
          </ThemedText>
          <View style={{ height: 48 }} />
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  scrollContent: { paddingBottom: 48 },
  hero: { alignItems: 'center', marginBottom: 12 },
  card: { padding: 16, borderRadius: 12, marginBottom: 12 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  bullet: { width: 8, height: 8, borderRadius: 4 },
  priceRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  priceChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  cta: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
});




