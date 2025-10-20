import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import ChatTransactionCard, { ChatDraftTx } from '@/components/ui/ChatTransactionCard';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildFinanceContext90d } from '@/lib/ai-advisor';
import { getPersonalitySettings } from '@/lib/settings';
import { chatFinance, ChatMessage, isTransactionIntent } from '@/lib/openai';
import { nsKey } from '@/lib/user';
import { database, DatabaseException, getCategoryFromDescription } from '@/lib/database';
import { getPrivacySettings } from '@/lib/settings';
import { getCurrentUser, getCurrentHouseholdId } from '@/lib/user';
import { useAiQuota } from '@/lib/subscription';

const STORAGE_KEY_BASE = 'assistant.thread.v1';

export default function AssistantScreen() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<any | null>(null);
  const [draftCards, setDraftCards] = useState<ChatDraftTx[]>([]);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; text: string; txId?: string | null }>({ visible: false, text: '', txId: null });
  const scrollRef = useRef<ScrollView>(null);

  const loadThread = useCallback(async () => {
    try {
      const key = await nsKey(STORAGE_KEY_BASE);
      const raw = await AsyncStorage.getItem(key);
      if (raw) setMessages(JSON.parse(raw));
    } catch {}
  }, []);

  const saveThread = useCallback(async (data: ChatMessage[]) => {
    try {
      const key = await nsKey(STORAGE_KEY_BASE);
      await AsyncStorage.setItem(key, JSON.stringify(data.slice(-30)));
    } catch {}
  }, []);

  const loadContext = useCallback(async () => {
    try {
      const [ctx, pers] = await Promise.all([
        buildFinanceContext90d(),
        getPersonalitySettings(),
      ]);
      setContext({ ...ctx, personality: pers });
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
      // Classify intent first
      const intent = await isTransactionIntent(content);
      const reply = await chatFinance([userMsg], context);
      const asst: ChatMessage = { role: 'assistant', content: reply };
      setDraftCards(intent ? parseTransactionsInline(content) : []);
      setMessages((prev) => [...prev, asst]);
    } catch (e: any) {
      const asst: ChatMessage = { role: 'assistant', content: 'Xin lỗi, hiện không thể trả lời. Vui lòng thử lại sau.' };
      setMessages((prev) => [...prev, asst]);
    } finally {
      setLoading(false);
    }
  }, [input, context]);

  // Simple in-memory dedupe cache
  const dedupeCache = useRef<Map<string, number>>(new Map());

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

        {/* Draft transaction cards */}
        {draftCards.map((d, i) => (
          <View key={`card-${i}`} style={{ alignSelf: 'flex-start', width: '100%' }}> 
            <ChatTransactionCard
              draft={d}
              onCancel={() => setDraftCards((prev) => prev.filter((_, idx) => idx !== i))}
              onConfirm={async (next) => {
                // Dedupe 60s via in-memory cache key
                const key = `${next.amount}|${next.date}|${next.category}|${next.description}`.toLowerCase();
                const now = Date.now();
                const last = dedupeCache.current.get(key);
                if (last && now - last < 60000) {
                  setMessages(prev => [...prev, { role: 'assistant', content: 'Đã lưu trước đó (trong 60 giây). Bỏ qua.' }]);
                  setDraftCards((prev) => prev.filter((_, idx) => idx !== i));
                  return '' as any;
                }
                dedupeCache.current.set(key, now);

                // Gating quota (best-effort). If not available due to RLS/permission, continue with local save.
                try {
                  await database.init();
                  const [privacy, user, hid] = await Promise.all([getPrivacySettings(), getCurrentUser(), getCurrentHouseholdId()]);
                  let safeHouseholdId: string | null = null;
                  try {
                    if (user?.id && hid) {
                      const { getUserHouseholds } = await import('@/lib/database');
                      const households = await getUserHouseholds(user.id);
                      if (households.some(h => h.id === hid)) safeHouseholdId = hid;
                    }
                  } catch {}

                  if (safeHouseholdId) {
                    try {
                      const res = await useAiQuota(safeHouseholdId, 'chat_tx_save');
                      if (!res.allowed) throw new Error('Hết quota cho thao tác này.');
                    } catch (qe) {
                      // ignore quota errors in chat save; we will still save locally/Fallback
                    }
                  }

                  const id = await database.addTransaction({
                    amount: next.amount,
                    description: next.description.trim(),
                    category: next.category,
                    date: next.date,
                    type: next.type,
                    source: 'ai',
                    currency: next.currency || 'VND',
                    is_private: !!privacy.privateMode,
                    owner_user_id: user?.id || null,
                    household_id: safeHouseholdId,
                  });
                  // After save: pretty toast-like message
                  setSnackbar({ visible: true, text: `Đã lưu · ${next.category} · ${new Intl.NumberFormat('vi-VN').format(next.amount)} ${next.currency}`, txId: id });
                  setDraftCards((prev) => prev.filter((_, idx) => idx !== i));
                } catch (e: any) {
                  setMessages(prev => [...prev, { role: 'assistant', content: e?.message || 'Không thể lưu giao dịch.' }]);
                }
              }}
            />
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

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ visible: false, text: '', txId: null })}
        duration={2500}
        action={snackbar.txId ? { label: 'Chi tiết', onPress: () => router.push({ pathname: '/add-transaction', params: { id: snackbar.txId, mode: 'edit' } }) } : undefined}
      >
        {snackbar.text}
      </Snackbar>
    </ThemedView>
  );
}
// ---- Lightweight parser and card render text placeholder (UI card will replace) ----
type DraftTx = {
  amount: number;
  currency: string;
  description: string;
  category: string;
  date: string; // yyyy-mm-dd
  type: 'income' | 'expense';
  hash: string;
};

const CURRENCY_SIGNS: Record<string, string[]> = { VND: ['đ', '₫', 'vnd'], USD: ['$', 'usd'], EUR: ['€', 'eur'] };

function normalizeAmountToken(tok: string): number | null {
  // supports 12.5k, 12,5k, 1.2m, 1,2m, 120000
  let t = tok.toLowerCase().replace(/,/g, '.');
  const isMillion = /(triệu|trieu|\btr\b)/.test(t) || t.endsWith('m');
  const isThousand = /(ngàn|nghìn)/.test(t) || t.endsWith('k');
  const mul = isMillion ? 1_000_000 : isThousand ? 1_000 : 1;
  t = t.replace(/[^0-9.]/g, '');
  const val = parseFloat(t);
  if (!isFinite(val) || val <= 0) return null;
  return Math.round(val * mul);
}

function detectCurrency(s: string): string {
  const l = s.toLowerCase();
  if (/[€]/.test(s) || /\beur\b/.test(l)) return 'EUR';
  if (/(\$)|\busd\b/.test(l)) return 'USD';
  if (/(₫|\bvnd\b|\bvnđ\b)/.test(l)) return 'VND';
  return 'VND';
}

function parseTransactionsInline(input: string): DraftTx[] {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  let date = `${yyyy}-${mm}-${dd}`;
  const lower = input.toLowerCase();
  // Hard guard: only parse when message contains explicit money unit/currency
  const moneyMarker = /(\d+([\.,]\d+)?\s*(đ|₫|vnd|vnđ|k|ngàn|nghìn|triệu|trieu|tr|m))|(([$€]|usd|eur)\s*\d+)/i;
  if (!moneyMarker.test(lower)) {
    return [];
  }
  // simple relative dates
  if (/(hôm qua|yesterday)/.test(lower)) {
    const d = new Date(today); d.setDate(today.getDate() - 1);
    date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  const absDate = lower.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (absDate) {
    const d = absDate[1].padStart(2,'0');
    const m = absDate[2].padStart(2,'0');
    const y = absDate[3].length === 2 ? `20${absDate[3]}` : absDate[3];
    date = `${y}-${m}-${d}`;
  }

  const currency = detectCurrency(input);

  // Split by commas or semicolons to allow multiple entries
  const parts = input.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
  const drafts: DraftTx[] = [];

  for (const part of parts) {
    // tokenization: require explicit unit/currency near the number
    const amountMatch = part.match(/((\d+([\.,]\d+)?)\s*(k|ngàn|nghìn|triệu|trieu|tr|m|đ|₫|vnd|vnđ))|(([$€]|usd|eur)\s*\d+([\.,]\d+)?)/i);
    const amount = amountMatch ? normalizeAmountToken(amountMatch[0]) : null;
    if (!amount) continue;
    const desc = part.replace(amountMatch[0], '').replace(/\s+(đ|₫|vnd|vnđ|usd|eur)/ig,'').trim() || 'Giao dịch';
    const category = getCategoryFromDescription(desc);
    const hasUnit = /(\d+([\.,]\d+)?\s*(đ|₫|vnd|vnđ|k|ngàn|nghìn|triệu|trieu|tr|m))|(([$€]|usd|eur)\s*\d+)/i.test(part);
    // If no explicit money unit and category is unknown => skip (avoid false positive like "tóm tắt 90 ngày")
    if (!hasUnit && (!category || category === 'Khác')) {
      continue;
    }
    const type: 'income' | 'expense' = /(thu|income|nhận|chuyển vào|tặng|salary|lương)/i.test(part) ? 'income' : 'expense';
    const hash = `${amount}|${date}|${category}|${desc}`.toLowerCase();
    drafts.push({ amount, currency, description: desc, category, date, type, hash });
  }

  // group by category when same message has multiple of same category
  const grouped = new Map<string, DraftTx>();
  for (const d of drafts) {
    const key = `${d.category}|${d.date}|${d.type}|${d.currency}`;
    const prev = grouped.get(key);
    if (prev) {
      prev.amount += d.amount;
      prev.description = prev.description; // keep first
      prev.hash = `${prev.amount}|${prev.date}|${prev.category}|${prev.description}`;
    } else {
      grouped.set(key, { ...d });
    }
  }
  return Array.from(grouped.values());
}

function renderCardText(d: DraftTx): string {
  // Placeholder text if UI card not yet implemented
  const n = new Intl.NumberFormat('vi-VN').format(d.amount);
  return `[Gợi ý giao dịch] ${d.category} · ${n} ${d.currency}\n${d.description} · ${d.date} · ${d.type}`;
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


