import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput } from 'react-native';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useThemeColor } from '@/hooks/use-theme-color';
import { updatePassword } from '@/lib/auth';
import { useRouter } from 'expo-router';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const tint = useThemeColor({}, 'tint');
  const text = useThemeColor({}, 'text');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (password.length < 6) {
      Alert.alert('Mật khẩu quá ngắn', 'Ít nhất 6 ký tự');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Không khớp', 'Mật khẩu nhập lại không khớp');
      return;
    }
    try {
      setLoading(true);
      await updatePassword(password);
      Alert.alert('Thành công', 'Đã đặt lại mật khẩu');
      router.replace('/');
    } catch (e: any) {
      Alert.alert('Lỗi', e?.message || 'Không thể đặt lại mật khẩu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={{ flex: 1, padding: 16, justifyContent: 'center' }}>
      <ThemedText type="title" style={{ marginBottom: 12 }}>Đặt lại mật khẩu</ThemedText>
      <TextInput
        style={[styles.input, { borderColor: tint + '30', color: text }]}
        placeholder="Mật khẩu mới"
        placeholderTextColor={text + '60'}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        style={[styles.input, { borderColor: tint + '30', color: text }]}
        placeholder="Nhập lại mật khẩu"
        placeholderTextColor={text + '60'}
        secureTextEntry
        value={confirm}
        onChangeText={setConfirm}
      />
      <Pressable style={[styles.button, { backgroundColor: tint, opacity: loading ? 0.6 : 1 }]} onPress={onSubmit} disabled={loading}>
        <ThemedText style={{ color: '#fff', fontWeight: '700' }}>Xác nhận</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  button: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
});

