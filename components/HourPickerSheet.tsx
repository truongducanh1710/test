import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, StyleSheet, ScrollView, Dimensions, Pressable, Animated, PanResponder, BackHandler } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';

const ITEM_HEIGHT = 44; // used for vertical spacing of text box inside row
const ITEM_WIDTH = 64; // width per hour item for horizontal scroller
const WHEEL_HEIGHT = 112; // enlarged for easier interaction
const VISIBLE_COUNT = 5; // visible items horizontally (center + 2 each side)

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
  const [selectedHour, setSelectedHour] = useState(Math.max(0, Math.min(23, Math.floor(initialHour)))); // persisted value
  const [tempHour, setTempHour] = useState(Math.max(0, Math.min(23, Math.floor(initialHour)))); // in-sheet value
  const headerAnim = useRef(new Animated.Value(0)).current;
  const scrollX = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  useEffect(() => {
    if (!visible) return;
    // Sync temp state with current saved hour when opening
    const openHour = Math.max(0, Math.min(23, Math.floor(initialHour)));
    setTempHour(openHour);
    // Scroll to saved hour position on open
    setTimeout(() => {
      scrollRef.current?.scrollTo({ x: openHour * ITEM_WIDTH, animated: false });
    }, 0);
    // animate in
    Animated.parallel([
        Animated.timing(sheetTranslateY, { toValue: 0, duration: 280, useNativeDriver: true, easing: (t) => 1 - Math.pow(1 - t, 3) }),
        Animated.timing(overlayOpacity, { toValue: 0.5, duration: 280, useNativeDriver: true })
      ]).start(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      });
    // back press handler (Android)
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (visible) {
        closeWithAnimation();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [visible, initialHour]);

  const animateHeader = () => {
    headerAnim.setValue(0);
    Animated.parallel([
      Animated.timing(headerAnim, { toValue: 1, duration: 150, useNativeDriver: true })
    ]).start();
  };

  const onMomentumEnd = (e: any) => {
    const x = e.nativeEvent.contentOffset.x;
    const index = Math.round(x / ITEM_WIDTH);
    const clamped = Math.max(0, Math.min(23, index));
    if (clamped !== tempHour) {
      setTempHour(clamped);
      animateHeader();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    // snap to exact
    scrollRef.current?.scrollTo({ x: clamped * ITEM_WIDTH, animated: true });
  };

  const containerHeight = Math.min(Dimensions.get('window').height * 0.65, 520);

  const pan = useRef(new Animated.Value(0)).current; // track drag distance
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (_, g) => false,
      onMoveShouldSetPanResponder: (_, g) => {
        const vy = Math.abs(g.dy);
        const vx = Math.abs(g.dx);
        return vy > 6 && vy > vx; // only capture vertical drags
      },
      onPanResponderMove: (_, g) => {
        const dy = Math.max(0, g.dy);
        sheetTranslateY.setValue(dy);
      },
      onPanResponderRelease: (_, g) => {
        const threshold = containerHeight * 0.28; // ~28%
        if (g.dy > threshold) {
          closeWithAnimation();
        } else {
          Animated.timing(sheetTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  const closeWithAnimation = () => {
    Animated.parallel([
      Animated.timing(sheetTranslateY, { toValue: containerHeight, duration: 240, useNativeDriver: true, easing: (t) => Math.pow(t, 3) }), // easeInCubic
      Animated.timing(overlayOpacity, { toValue: 0, duration: 240, useNativeDriver: true })
    ]).start(() => {
      onClose();
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Overlay */}
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <Pressable style={{ flex: 1 }} onPress={closeWithAnimation} />
      </Animated.View>

      {/* Sheet (animate whole container) */}
      <Animated.View
        style={[styles.sheet, { height: containerHeight, backgroundColor: bg, transform: [{ translateY: sheetTranslateY }] }]}
      > 
        {/* Header */}
        <ThemedText style={{ textAlign: 'center', marginTop: 12, fontSize: 20, fontWeight: '700' }}>Chọn giờ nhắc</ThemedText>

        {/* Wheel (đưa lên ngay dưới header) */}
        <View style={{ height: WHEEL_HEIGHT, position: 'relative', marginTop: 36 }}>
          {/* Drag handle area (captures vertical pan only) */}
          <View {...panResponder.panHandlers} style={styles.dragArea}>
            <View style={styles.dragBar} />
          </View>
          {/* Center highlight */}
        

          <Animated.ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={ITEM_WIDTH}
            decelerationRate="fast"
            onMomentumScrollEnd={onMomentumEnd}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { x: scrollX } } }],
              { useNativeDriver: true }
            )}
            contentContainerStyle={{ paddingHorizontal: (Dimensions.get('window').width - ITEM_WIDTH) / 2 }}
          >
            {hours.map((h) => {
              const isSelected = h === tempHour;
              const inputRange = [(h - 1) * ITEM_WIDTH, h * ITEM_WIDTH, (h + 1) * ITEM_WIDTH];
              const scale = scrollX.interpolate({ inputRange, outputRange: [0.92, 1.08, 0.92], extrapolate: 'clamp' });
              const opacity = scrollX.interpolate({ inputRange, outputRange: [0.5, 1, 0.5], extrapolate: 'clamp' });
              return (
                <Pressable key={h} onPress={() => scrollRef.current?.scrollTo({ x: h * ITEM_WIDTH, animated: true })}>
                  <Animated.View style={[styles.item, { width: ITEM_WIDTH, height: WHEEL_HEIGHT, paddingVertical: 12, transform: [{ scale }], opacity }]}> 
                    <ThemedText style={{
                      fontSize: isSelected ? 22 : 18,
                      fontWeight: isSelected ? '700' as const : '500' as const,
                      color: text,
                      textAlign: 'center',
                    }}>
                      {String(h).padStart(2, '0')}:00
                    </ThemedText>
                  </Animated.View>
                </Pressable>
              );
            })}
          </Animated.ScrollView>
        </View>

        {/* Selected time - nhỏ gọn dưới scroller */}
        <Animated.View style={{
          transform: [{ scale: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) }],
          opacity: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1] })
        }}>
          <ThemedText style={{ textAlign: 'center', color: tint, marginTop: 10, marginBottom: 8, fontSize: 16, fontWeight: '700' }}>
            Giờ đã chọn: {String(tempHour).padStart(2, '0')}:00
          </ThemedText>
        </Animated.View>

        {/* Presets */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }} style={{ marginBottom: 12 }}>
          {presets.map((p) => {
            const active = tempHour === p.hour;
            return (
              <Pressable
                key={p.label}
                style={[
                  styles.preset,
                  { borderColor: active ? 'transparent' : tint, backgroundColor: active ? tint : 'transparent', height: 48 },
                ]}
                onPress={() => {
                  setTempHour(p.hour);
                  scrollRef.current?.scrollTo({ x: p.hour * ITEM_WIDTH, animated: true });
                  Haptics.selectionAsync();
                  animateHeader();
                }}
              >
                <ThemedText style={{ color: active ? '#fff' : tint, fontWeight: '700' }}>{p.label}</ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Footer actions */}
        {/* Footer actions */}
        {!applyImmediately && (
          <View style={styles.footer}> 
            <Pressable style={[styles.btn, { borderColor: '#6B7280' }]} onPress={closeWithAnimation}><ThemedText style={{ color: '#6B7280', fontWeight: '700' }}>Huỷ</ThemedText></Pressable>
            <Pressable style={[styles.btn, { borderColor: tint }]} onPress={() => { setSelectedHour(tempHour); onSave(tempHour); closeWithAnimation(); }}><ThemedText style={{ color: tint, fontWeight: '700' }}>Lưu</ThemedText></Pressable>
          </View>
        )}
      </Animated.View>
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
    backgroundColor: 'rgba(255,255,255,0.12)'
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
  centerHighlightH: {
    position: 'absolute',
    left: Dimensions.get('window').width / 2 - ITEM_WIDTH / 2,
    top: WHEEL_HEIGHT / 2 - (ITEM_HEIGHT - 16) / 2,
    width: ITEM_WIDTH,
    height: ITEM_HEIGHT - 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    zIndex: 2,
    borderRadius: 10,
  },
  
  fadeTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: (ITEM_HEIGHT * ((VISIBLE_COUNT - 1) / 2)) + 6,
    backgroundColor: 'rgba(255,255,255,0.12)'
  },
  fadeBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 60,
    height: (ITEM_HEIGHT * ((VISIBLE_COUNT - 1) / 2)) + 6,
    backgroundColor: 'rgba(255,255,255,0.12)'
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
  },
  dragArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  dragBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)'
  },
});
