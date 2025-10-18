import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useRouter } from 'expo-router';
import {
  getUserHouseholds,
  createHousehold,
  getHouseholdMembers,
  createHouseholdInvite,
  deleteHousehold,
  type Household,
  type HouseholdMember,
} from '@/lib/database';
import { getCurrentUser } from '@/lib/auth';
import { getCurrentHouseholdId, setCurrentHouseholdId } from '@/lib/family';
import { leaveHousehold, recomputeEntitlementsForSelf } from '@/lib/database';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';

export default function FamilyScreen() {
  const router = useRouter();
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const bg = useThemeColor({}, 'background');

  const [loading, setLoading] = useState(true);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [currentHouseholdId, setCurrentHouseholdIdState] = useState<string | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newHouseholdName, setNewHouseholdName] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const user = await getCurrentUser();
      if (!user) {
        router.replace('/auth');
        return;
      }

      setCurrentUserId(user.id);

      const hhList = await getUserHouseholds(user.id);
      setHouseholds(hhList);

      const currentId = await getCurrentHouseholdId();
      setCurrentHouseholdIdState(currentId);

      if (currentId) {
        const membersList = await getHouseholdMembers(currentId);
        setMembers(membersList);
      }
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateHousehold = async () => {
    if (!newHouseholdName.trim()) {
      Alert.alert('Tên gia đình không được để trống');
      return;
    }

    try {
      const user = await getCurrentUser();
      if (!user) return;

      const newId = await createHousehold(newHouseholdName.trim(), user.id);
      await setCurrentHouseholdId(newId);
      setShowCreateForm(false);
      setNewHouseholdName('');
      loadData();
      Alert.alert('Thành công', 'Đã tạo gia đình mới!');
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể tạo gia đình');
    }
  };

  const handleSelectHousehold = async (id: string) => {
    await setCurrentHouseholdId(id);
    setCurrentHouseholdIdState(id);
    await recomputeEntitlementsForSelf().catch(() => {});
    loadData();
  };

  const handleGenerateInvite = async () => {
    if (!currentHouseholdId) {
      Alert.alert('Chưa chọn gia đình');
      return;
    }

    try {
      const invite = await createHouseholdInvite(currentHouseholdId);
      setInviteUrl(invite.url);
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể tạo link mời');
    }
  };

  const handleCopyInviteUrl = async () => {
    if (inviteUrl) {
      await Clipboard.setStringAsync(inviteUrl);
      Alert.alert('Đã sao chép link mời!');
    }
  };

  const loadFromClipboard = async () => {
    const val = await Clipboard.getStringAsync();
    if (val) setPasteUrl(val.trim());
  };

  const handleJoinByLink = async () => {
    const raw = pasteUrl.trim();
    if (!raw) {
      Alert.alert('Thiếu link', 'Dán link mời vào trước khi tham gia.');
      return;
    }
    try {
      const url = new URL(raw);
      const hid = url.searchParams.get('hid') || '';
      const t = url.searchParams.get('t') || '';
      if (!t) throw new Error('Link mời không hợp lệ');
      router.replace({ pathname: '/join', params: { hid, t } } as any);
    } catch {
      Alert.alert('Link không hợp lệ', 'Hãy dán link dạng test://join?hid=...&t=...');
    }
  };

  const confirmAndDeleteHousehold = async () => {
    if (!currentHouseholdId) return;
    Alert.alert(
      'Xóa gia đình',
      'Hành động này sẽ xóa gia đình và thành viên liên quan. Các giao dịch sẽ không bị xóa nhưng sẽ được tách khỏi gia đình. Bạn có chắc muốn tiếp tục?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteHousehold(currentHouseholdId);
              await setCurrentHouseholdId(null);
              setCurrentHouseholdIdState(null);
              setInviteUrl(null);
              await recomputeEntitlementsForSelf().catch(() => {});
              await loadData();
              Alert.alert('Đã xóa', 'Gia đình đã được xóa thành công');
            } catch (e: any) {
              Alert.alert('Lỗi', e?.message || 'Không thể xóa gia đình');
            }
          },
        },
      ]
    );
  };

  const confirmAndLeaveHousehold = async () => {
    if (!currentHouseholdId) return;
    Alert.alert(
      'Rời gia đình',
      'Bạn sẽ rời gia đình này. Nếu bạn là người trả tiền Pro, quyền Pro sẽ chuyển sang cá nhân bạn cho đến hết kỳ hiện tại.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Rời gia đình',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveHousehold(currentHouseholdId);
              await setCurrentHouseholdId(null);
              setCurrentHouseholdIdState(null);
              await recomputeEntitlementsForSelf().catch(() => {});
              await loadData();
              Alert.alert('Đã rời', 'Bạn đã rời gia đình thành công');
            } catch (e: any) {
              Alert.alert('Lỗi', e?.message || 'Không thể rời gia đình');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color={tint} />
      </ThemedView>
    );
  }

  const currentHousehold = households.find((h) => h.id === currentHouseholdId);
  const isAdminOrCreator = !!(
    currentUserId &&
    (
      (currentHousehold && currentHousehold.created_by === currentUserId) ||
      members.some((m) => m.user_id === currentUserId && m.role === 'admin')
    )
  );

  return (
    <ScrollView style={{ backgroundColor: bg }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
      <ThemedView style={{ gap: 16 }}>
        <ThemedText type="title">Quản lý Gia đình</ThemedText>

        {/* Danh sách households */}
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
            Gia đình của bạn
          </ThemedText>
          {households.length === 0 ? (
            <ThemedText style={{ opacity: 0.7 }}>Chưa có gia đình nào</ThemedText>
          ) : (
            households.map((hh) => (
              <Pressable
                key={hh.id}
                style={[
                  styles.householdItem,
                  { borderColor: hh.id === currentHouseholdId ? tint : text + '30' },
                ]}
                onPress={() => handleSelectHousehold(hh.id)}
              >
                <ThemedText style={{ fontWeight: hh.id === currentHouseholdId ? '700' : '400' }}>
                  {hh.name}
                </ThemedText>
                {hh.id === currentHouseholdId && (
                  <ThemedText style={{ color: tint, fontSize: 12 }}>✓ Đang chọn</ThemedText>
                )}
              </Pressable>
            ))
          )}
        </ThemedView>

        {/* Tạo gia đình mới */}
        {!showCreateForm ? (
          <Pressable
            style={[styles.button, { backgroundColor: tint }]}
            onPress={() => setShowCreateForm(true)}
          >
            <ThemedText style={{ color: '#fff', fontWeight: '700' }}>+ Tạo gia đình mới</ThemedText>
          </Pressable>
        ) : (
          <ThemedView style={styles.card}>
            <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
              Tạo gia đình mới
            </ThemedText>
            <TextInput
              style={[styles.input, { borderColor: tint + '30', color: text }]}
              placeholder="Tên gia đình (vd: Gia đình Nguyễn)"
              placeholderTextColor={text + '60'}
              value={newHouseholdName}
              onChangeText={setNewHouseholdName}
            />
            <ThemedView style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Pressable
                style={[styles.button, { backgroundColor: tint, flex: 1 }]}
                onPress={handleCreateHousehold}
              >
                <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Tạo</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: text + '20', flex: 1 }]}
                onPress={() => {
                  setShowCreateForm(false);
                  setNewHouseholdName('');
                }}
              >
                <ThemedText style={{ fontWeight: '700' }}>Hủy</ThemedText>
              </Pressable>
            </ThemedView>
          </ThemedView>
        )}

        {/* Tham gia bằng link mời */}
        <ThemedView style={styles.card}>
          <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
            Tham gia gia đình bằng link
          </ThemedText>
          <TextInput
            style={[styles.input, { borderColor: tint + '30', color: text }]}
            placeholder="Dán link mời test://join?hid=...&t=..."
            placeholderTextColor={text + '60'}
            value={pasteUrl}
            onChangeText={setPasteUrl}
          />
          <ThemedView style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Pressable style={[styles.button, { backgroundColor: text + '20', flex: 1 }]} onPress={loadFromClipboard}>
              <ThemedText style={{ fontWeight: '700' }}>Dán từ Clipboard</ThemedText>
            </Pressable>
            <Pressable style={[styles.button, { backgroundColor: tint, flex: 1 }]} onPress={handleJoinByLink}>
              <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Tham gia</ThemedText>
            </Pressable>
          </ThemedView>
        </ThemedView>

        {/* Thông tin gia đình hiện tại */}
        {currentHousehold && (
          <>
            <ThemedView style={styles.card}>
              <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
                {currentHousehold.name}
              </ThemedText>
              <ThemedText style={{ opacity: 0.7, marginBottom: 12 }}>
                Thành viên: {members.length}
              </ThemedText>
              {members.map((m) => (
                <ThemedView key={m.id} style={styles.memberItem}>
                  <ThemedText>
                    {m.user_id.slice(0, 8)}... ({m.role})
                  </ThemedText>
                </ThemedView>
              ))}
              {isAdminOrCreator ? (
                <Pressable
                  style={[styles.button, { backgroundColor: '#ef4444', marginTop: 8 }]}
                  onPress={confirmAndDeleteHousehold}
                >
                  <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Xóa gia đình</ThemedText>
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.button, { backgroundColor: text + '20', marginTop: 8 }]}
                  onPress={confirmAndLeaveHousehold}
                >
                  <ThemedText style={{ fontWeight: '700' }}>Rời gia đình</ThemedText>
                </Pressable>
              )}
            </ThemedView>

            {/* Mời thành viên */}
            <ThemedView style={styles.card}>
              <ThemedText type="subtitle" style={{ marginBottom: 8 }}>
                Mời thành viên
              </ThemedText>
              {!inviteUrl ? (
                <Pressable
                  style={[styles.button, { backgroundColor: tint }]}
                  onPress={handleGenerateInvite}
                >
                  <ThemedText style={{ color: '#fff', fontWeight: '700' }}>
                    Tạo link mời / QR
                  </ThemedText>
                </Pressable>
              ) : (
                <ThemedView style={{ alignItems: 'center', gap: 12 }}>
                  <QRCode value={inviteUrl} size={200} backgroundColor="white" />
                  <Pressable
                    style={[styles.button, { backgroundColor: tint }]}
                    onPress={handleCopyInviteUrl}
                  >
                    <ThemedText style={{ color: '#fff', fontWeight: '700' }}>
                      Sao chép link
                    </ThemedText>
                  </Pressable>
                  <Pressable onPress={() => setInviteUrl(null)}>
                    <ThemedText style={{ color: tint, fontSize: 14 }}>Đóng</ThemedText>
                  </Pressable>
                </ThemedView>
              )}
            </ThemedView>
          </>
        )}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { padding: 16, borderRadius: 12, gap: 8 },
  householdItem: {
    padding: 12,
    borderWidth: 2,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberItem: { paddingVertical: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  button: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
});

