import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, StyleSheet, ScrollView, Dimensions, Pressable, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';

const ITEM_HEIGHT = 44;
const VISIBLE_COUNT = 7; // odd number so center item is clear

export interface HourPickerSheetProps {
  visible: boolean;
  initialHour?: number; // 0-23
  onClose: () => void;
  onSave: (hour: number) => void;
  presets?: Array<{ label: string; hour: number }>; // e.g. [{label:'Sáng 6:00', hour:6}]
  applyImmediately?: boolean; // when true, save+close on snap/preset
}

export function HourPickerSheet({ visible, initialHour = 20, onClose, onSave, presets = [{ label: 'Sáng 6:00', hour: 6 }, { label: 'Trưa 12:00', hour: 12 }, { label: 'Tối 21:00', hour: 21 }], applyImmediately = false }: HourPickerSheetProps) {
  const text = useThemeColor({}, 'text');
  const bg = useThemeColor({}, 'background');
  const tint = useThemeColor({}, 'tint');

  const scrollRef = useRef<ScrollView | null>(null);
  const [selectedHour, setSelectedHour] = useState(Math.max(0, Math.min(23, Math.floor(initialHour))));
  const headerAnim = useRef(new Animated.Value(0)).current;

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  useEffect(() => {
    if (!visible) return;
    setSelectedHour(Math.max(0, Math.min(23, Math.floor(initialHour))));
    // scroll to initial
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedHour * ITEM_HEIGHT, animated: false });
    }, 0);
  }, [visible, initialHour]);

  const animateHeader = () => {
    headerAnim.setValue(0);
    Animated.parallel([
      Animated.timing(headerAnim, { toValue: 1, duration: 150, useNativeDriver: true })
    ]).start();
  };

  const onMomentumEnd = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const index = Math.round(y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(23, index));
    if (clamped !== selectedHour) {
      setSelectedHour(clamped);
      animateHeader();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (applyImmediately) {
        onSave(clamped);
        onClose();
      }
    }
    // snap to exact
    scrollRef.current?.scrollTo({ y: clamped * ITEM_HEIGHT, animated: true });
  };

  const containerHeight = Math.min(Dimensions.get('window').height * 0.65, 520);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Overlay */}
      <Pressable style={styles.overlay} onPress={onClose} />

      {/* Sheet */}
      <ThemedView style={[styles.sheet, { height: containerHeight, backgroundColor: bg }]}> 
        {/* Header */}
        <ThemedText style={{ textAlign: 'center', marginTop: 12, fontSize: 20, fontWeight: '700' }}>Chọn giờ nhắc</ThemedText>

        {/* Wheel (đưa lên ngay dưới header) */}
        <View style={{ flex: 1, position: 'relative', marginTop: 8 }}>
          {/* Center highlight */}
          <View pointerEvents="none" style={[styles.centerHighlight, { borderColor: tint }]} />
          {/* Top/Bottom fade overlays */}
          <View pointerEvents="none" style={[styles.fadeTop]} />
          <View pointerEvents="none" style={[styles.fadeBottom]} />

          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            decelerationRate="fast"
            onMomentumScrollEnd={onMomentumEnd}
            contentContainerStyle={{ paddingVertical: (ITEM_HEIGHT * ((VISIBLE_COUNT - 1) / 2)) }}
          >
            {hours.map((h) => {
              const isSelected = h === selectedHour;
              return (
                <View key={h} style={[styles.item, { height: ITEM_HEIGHT }]}> 
                  <ThemedText style={{
                    fontSize: isSelected ? 22 : 18,
                    fontWeight: isSelected ? '700' as const : '500' as const,
                    opacity: isSelected ? 1 : 0.5,
                    color: text,
                    textAlign: 'center',
                  }}>
                    {String(h).padStart(2, '0')}:00
                  </ThemedText>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* Selected time - nhỏ gọn dưới scroller */}
        <Animated.View style={{
          transform: [{ scale: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) }],
          opacity: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1] })
        }}>
          <ThemedText style={{ textAlign: 'center', color: tint, marginTop: 10, marginBottom: 8, fontSize: 16, fontWeight: '700' }}>
            Giờ đã chọn: {String(selectedHour).padStart(2, '0')}:00
          </ThemedText>
        </Animated.View>

        {/* Presets */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }} style={{ marginBottom: 12 }}>
          {presets.map((p) => {
            const active = selectedHour === p.hour;
            return (
              <Pressable
                key={p.label}
                style={[
                  styles.preset,
                  { borderColor: active ? 'transparent' : tint, backgroundColor: active ? tint : 'transparent', height: 48 },
                ]}
                onPress={() => {
                  setSelectedHour(p.hour);
                  scrollRef.current?.scrollTo({ y: p.hour * ITEM_HEIGHT, animated: true });
                  Haptics.selectionAsync();
                  animateHeader();
                  if (applyImmediately) {
                    onSave(p.hour);
                    onClose();
                  }
                }}
              >
                <ThemedText style={{ color: active ? '#fff' : tint, fontWeight: '700' }}>{p.label}</ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Footer actions */}
        {!applyImmediately && (
          <View style={styles.footer}> 
            <Pressable style={[styles.btn, { borderColor: '#6B7280' }]} onPress={onClose}><ThemedText style={{ color: '#6B7280', fontWeight: '700' }}>Huỷ</ThemedText></Pressable>
            <Pressable style={[styles.btn, { borderColor: tint }]} onPress={() => onSave(selectedHour)}><ThemedText style={{ color: tint, fontWeight: '700' }}>Lưu</ThemedText></Pressable>
          </View>
        )}
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)'
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden'
  },
  preset: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 12,
    marginRight: 12,
  },
  item: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerHighlight: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: (ITEM_HEIGHT * ((VISIBLE_COUNT - 1) / 2)) + 8,
    height: ITEM_HEIGHT - 16,
    borderWidth: 2,
    borderRadius: 10,
    zIndex: 2,
  },
  fadeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: (ITEM_HEIGHT * ((VISIBLE_COUNT - 1) / 2)) + 6,
    backgroundColor: 'rgba(0,0,0,0.35)'
  },
  fadeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 60,
    height: (ITEM_HEIGHT * ((VISIBLE_COUNT - 1) / 2)) + 6,
    backgroundColor: 'rgba(0,0,0,0.35)'
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1.5,
    borderRadius: 10,
    marginHorizontal: 4,
  }
});
