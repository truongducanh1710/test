import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildFinanceContext90d } from '@/lib/ai-advisor';
import { chatFinance, ChatMessage } from '@/lib/openai';

const STORAGE_KEY = 'assistant.thread.v1';

export default function AssistantScreen() {
  const colorScheme = useColorScheme();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<any | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const loadThread = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  }, []);

  const saveThread = useCallback(async (data: ChatMessage[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data.slice(-30)));
    } catch {}
  }, []);

  const loadContext = useCallback(async () => {
    try {
      const ctx = await buildFinanceContext90d();
      setContext(ctx);
    } catch (e) {
      setContext(null);
    }
  }, []);

  useEffect(() => {
    loadThread();
    loadContext();
  }, [loadThread, loadContext]);

  useEffect(() => {
    saveThread(messages);
  }, [messages, saveThread]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, loading]);

  const send = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content) return;
    setInput('');
    const userMsg: ChatMessage = { role: 'user', content };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const reply = await chatFinance([userMsg], context);
      const asst: ChatMessage = { role: 'assistant', content: reply };
      setMessages((prev) => [...prev, asst]);
    } catch (e: any) {
      const asst: ChatMessage = { role: 'assistant', content: 'Xin lỗi, hiện không thể trả lời. Vui lòng thử lại sau.' };
      setMessages((prev) => [...prev, asst]);
    } finally {
      setLoading(false);
    }
  }, [input, context]);

  const primary = Colors[colorScheme ?? 'light'].tint;
  const textColor = colorScheme === 'dark' ? '#fff' : '#111';
  const bubbleUser = colorScheme === 'dark' ? '#1f6aa0' : '#e0f2fe';
  const bubbleAI = colorScheme === 'dark' ? '#222' : '#f5f5f5';
  const stickyBg = colorScheme === 'dark' ? 'rgba(13,15,18,0.9)' : 'rgba(255,255,255,0.9)';
  const stickyBorder = colorScheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  const Quick = ({ label, prompt }: { label: string; prompt: string }) => (
    <TouchableOpacity style={[styles.quickChip, { borderColor: primary }]} onPress={() => send(prompt)}>
      <ThemedText>{label}</ThemedText>
    </TouchableOpacity>
  );

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Trợ lý tài chính</ThemedText>
        {context?.range?.end && (
          <ThemedText type="default" style={styles.badge}>Dữ liệu 90 ngày · cập nhật {context.range.end}</ThemedText>
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        stickyHeaderIndices={[0]}
      >
        {/* Sticky quick actions */}
        <View style={{ backgroundColor: stickyBg, paddingBottom: 6, paddingTop: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: stickyBorder }}>
          <View style={styles.quickRow}>
            <Quick label="Tóm tắt 90 ngày" prompt="Tóm tắt tài chính 90 ngày qua và nêu 3 điểm đáng chú ý." />
            <Quick label="Tối ưu ngân sách" prompt="Đề xuất cách tối ưu phân bổ ví và cắt giảm 2 danh mục lớn." />
            <Quick label="Cảnh báo vượt mức" prompt="Danh mục nào có nguy cơ vượt ngân sách sớm?" />
            <Quick label="Gợi ý tiết kiệm" prompt="Gợi ý 3 biện pháp tiết kiệm phù hợp số liệu của tôi." />
          </View>
        </View>

        {!messages.length && (
          <ThemedText style={{ opacity: 0.7 }}>Hãy đặt câu hỏi về tài chính của bạn. Ví dụ: "Tôi chi tiêu nhiều nhất vào đâu?"</ThemedText>
        )}

        {messages.map((m, idx) => (
          <View key={idx} style={[styles.msg, m.role === 'user' ? { alignSelf: 'flex-end', backgroundColor: bubbleUser } : { alignSelf: 'flex-start', backgroundColor: bubbleAI }]}>
            <ThemedText style={{ color: textColor }}>{m.content}</ThemedText>
          </View>
        ))}

        {loading && (
          <View style={[styles.msg, { alignSelf: 'flex-start', backgroundColor: bubbleAI }]}>
            <ThemedText>Đang suy nghĩ…</ThemedText>
          </View>
        )}
      </ScrollView>

      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} keyboardVerticalOffset={84}>
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { color: textColor, borderColor: primary }]}
            placeholder="Nhập câu hỏi về tài chính…"
            placeholderTextColor={colorScheme === 'dark' ? '#aaa' : '#666'}
            value={input}
            onChangeText={setInput}
            editable={!loading}
            multiline
          />
          <TouchableOpacity style={[styles.sendBtn, { backgroundColor: primary }]} onPress={() => send()} disabled={loading}>
            <ThemedText style={{ color: '#fff' }}>Gửi</ThemedText>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { gap: 4, marginBottom: 8 },
  badge: { opacity: 0.7 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  quickChip: { borderWidth: 1, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16 },
  scrollContent: { paddingBottom: 100, gap: 8 },
  msg: { padding: 10, borderRadius: 10, maxWidth: '85%' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 42, maxHeight: 120, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  sendBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
});


