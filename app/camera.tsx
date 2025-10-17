import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  Alert,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  Modal,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { OpenAIService, isOpenAIConfigured } from '@/lib/openai';
import { getCurrentHouseholdId } from '@/lib/family';
import { useAiQuota } from '@/lib/subscription';
import { database, getCategoryFromDescription } from '@/lib/database';
import { CameraState, ProcessingResult } from '@/types/transaction';

const { width, height } = Dimensions.get('window');

export default function CameraScreen() {
  const router = useRouter();
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [processingResult, setProcessingResult] = useState<ProcessingResult | null>(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [cameraLayout, setCameraLayout] = useState({ width: 0, height: 0 });
  const [showDateModal, setShowDateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [pendingToSave, setPendingToSave] = useState<{ amount: number; description: string; category: string; date: string; type: 'income' | 'expense'; source: 'ai' }[]>([]);
  
  const cameraRef = useRef<CameraView>(null);
  const backgroundColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'tint');

  useEffect(() => {
    // Initialize database when component mounts
    database.init().catch(console.error);
  }, []);

  if (!permission) {
    // Camera permissions are still loading
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color={tintColor} />
        <ThemedText style={styles.loadingText}>Đang tải camera...</ThemedText>
      </ThemedView>
    );
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet
    return (
      <ThemedView style={styles.container}>
        <ThemedView style={styles.permissionContainer}>
          <Ionicons name="camera" size={64} color={tintColor} />
          <ThemedText style={styles.permissionTitle}>Cần Quyền Truy Cập Camera</ThemedText>
          <ThemedText style={styles.permissionText}>
            Chúng tôi cần quyền truy cập camera để chụp ảnh sao kê ngân hàng cho AI xử lý.
          </ThemedText>
          <Pressable style={[styles.permissionButton, { backgroundColor: tintColor }]} onPress={requestPermission}>
            <ThemedText style={styles.permissionButtonText}>Cấp Quyền</ThemedText>
          </Pressable>
        </ThemedView>
      </ThemedView>
    );
  }

  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  const takePicture = async () => {
    if (!cameraRef.current) return;

    if (!isOpenAIConfigured()) {
      setShowApiKeyModal(true);
      return;
    }

    setCameraState('taking_photo');
    
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.95,
        base64: false,
        skipProcessing: false,
      });

      if (photo) {
        setCameraState('processing');
        const extracted = await processImage(photo.uri);
        if (extracted.length === 0) {
          setCameraState('error');
          Alert.alert('Không Tìm Thấy Giao Dịch', 'Không thể tìm thấy giao dịch nào trong ảnh. Vui lòng thử lại với ảnh rõ hơn.');
          return;
        }
        setPendingToSave(extracted);
        setSelectedDate(new Date());
        setShowDateModal(true);
        setCameraState('idle');
      }
    } catch (error) {
      console.error('Error taking picture:', error);
      setCameraState('error');
      Alert.alert('Lỗi', 'Không thể chụp ảnh. Vui lòng thử lại.');
    }
  };

  const pickImageFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1.0,
        allowsMultipleSelection: true,
      });

      if (!isOpenAIConfigured()) {
        setShowApiKeyModal(true);
        return;
      }

      if (!result.canceled && result.assets[0]) {
        setCameraState('processing');
        const uris = result.assets.map(a => a.uri).filter(Boolean) as string[];
        const all: { amount: number; description: string; category: string; date: string; type: 'income' | 'expense'; source: 'ai' }[] = [];
        for (const uri of uris) {
          const extracted = await processImage(uri);
          all.push(...extracted);
        }
        if (all.length === 0) {
          setCameraState('error');
          Alert.alert('Không Tìm Thấy Giao Dịch', 'Không thể tìm thấy giao dịch nào trong ảnh đã chọn.');
          return;
        }
        setPendingToSave(all);
        setSelectedDate(new Date());
        setShowDateModal(true);
        setCameraState('idle');
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Lỗi', 'Không thể chọn ảnh từ thư viện.');
    }
  };

  const processImage = async (imageUri: string) => {
    const startTime = Date.now();
    try {
      // Check AI quota before processing
      try {
        const hid = await getCurrentHouseholdId();
        if (hid) {
          const r = await useAiQuota(hid, 'ai_advisor');
          if (!r.allowed) {
            throw new Error('quota_exceeded');
          }
        }
      } catch (qerr: any) {
        if (qerr?.message === 'quota_exceeded') {
          Alert.alert('Hết lượt AI', 'Bạn đã dùng hết lượt AI trong tháng. Nâng cấp Pro để tiếp tục.', [
            { text: 'Đóng' },
            { text: 'Nâng cấp', onPress: () => router.push('/paywall' as any) },
          ]);
          return [];
        }
      }
      if (!isOpenAIConfigured()) {
        throw new Error('Thiếu API key OpenAI');
      }
      const transactions = await OpenAIService.extractTransactionsFromImage(imageUri);
      if (transactions.length === 0) {
        return [];
      }
      // Prepare but DO NOT SAVE yet
      const transactionsToSave = transactions.map(t => ({
        amount: t.amount,
        description: t.description,
        category: getCategoryFromDescription(t.description),
        date: t.date,
        type: t.type,
        source: 'ai' as const,
      }));
      const processingTime = Date.now() - startTime;
      const result: ProcessingResult = { success: true, transactions, processingTime };
      setProcessingResult(result);
      return transactionsToSave;
    } catch (error) {
      console.error('Error processing image:', error);
      const result: ProcessingResult = {
        success: false,
        transactions: [],
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
      setProcessingResult(result);
      if (!isOpenAIConfigured()) {
        setShowApiKeyModal(true);
      } else {
        Alert.alert('Xử Lý Thất Bại', result.error || 'Không thể xử lý ảnh. Vui lòng thử lại.');
      }
      return [];
    }
  };

  const resetCamera = () => {
    setCameraState('idle');
    setProcessingResult(null);
  };

  const goBack = () => {
    router.back();
  };

  if (cameraState === 'processing') {
    return (
      <ThemedView style={styles.processingContainer}>
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.processingGradient}
        >
          <ActivityIndicator size="large" color="white" />
          <ThemedText style={styles.processingTitle}>AI Đang Xử Lý Ảnh...</ThemedText>
          <ThemedText style={styles.processingSubtitle}>
            Trích xuất dữ liệu giao dịch từ sao kê ngân hàng của bạn
          </ThemedText>
          <ThemedView style={styles.processingSteps}>
            <ThemedText style={styles.processingStep}>📸 Đã chụp ảnh</ThemedText>
            <ThemedText style={styles.processingStep}>🤖 AI đang phân tích nội dung</ThemedText>
            <ThemedText style={styles.processingStep}>💰 Trích xuất các giao dịch</ThemedText>
          </ThemedView>
        </LinearGradient>
      </ThemedView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Missing API Key Modal */}
      <Modal visible={showApiKeyModal} transparent animationType="fade" onRequestClose={() => setShowApiKeyModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>Thiếu OpenAI API Key</ThemedText>
            <ThemedText style={styles.modalText}>
              Vui lòng thêm khóa vào file .env tại thư mục test/ và khởi động lại app:
            </ThemedText>
            <ThemedText style={styles.modalCode}>EXPO_PUBLIC_OPENAI_API_KEY=sk-xxxxxxxx</ThemedText>
            <ThemedText style={styles.modalSubText}>Sau đó chạy: npx expo start -c</ThemedText>
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalButton, { backgroundColor: tintColor }]} onPress={() => setShowApiKeyModal(false)}>
                <ThemedText style={styles.modalButtonText}>Đóng</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Confirmation Modal */}
      <Modal visible={showDateModal} transparent animationType="fade" onRequestClose={() => setShowDateModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>Chọn ngày áp dụng cho tất cả</ThemedText>
            <ThemedText style={styles.modalText}>Sẽ áp dụng ngày này cho {pendingToSave.length} giao dịch vừa nhận diện.</ThemedText>
            <View style={{ alignItems: 'center', marginVertical: 12 }}>
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display="default"
                maximumDate={new Date()}
                onChange={(_, d) => d && setSelectedDate(d)}
              />
            </View>
            <View style={[styles.modalActions, { gap: 12 }]}>
              <Pressable style={[styles.modalButton, { backgroundColor: '#374151' }]} onPress={() => { setShowDateModal(false); setPendingToSave([]); }}>
                <ThemedText style={styles.modalButtonText}>Hủy</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.modalButton, { backgroundColor: tintColor }]}
                onPress={async () => {
                  try {
                    const dateStr = selectedDate.toISOString().split('T')[0];
                    const payload = pendingToSave.map(t => ({ ...t, date: dateStr }));
                    await database.addTransactionsBatch(payload);
                    setShowDateModal(false);
                    setPendingToSave([]);
                    Alert.alert(
                      'Thành Công! 🎉',
                      `Đã lưu ${payload.length} giao dịch.`,
                      [
                        { text: 'Xem Giao Dịch', onPress: () => router.push('/transactions') },
                        { text: 'Chụp Tiếp', onPress: resetCamera },
                      ]
                    );
                  } catch (e) {
                    console.error(e);
                    Alert.alert('Lỗi', 'Không thể lưu giao dịch. Vui lòng thử lại.');
                  }
                }}
              >
                <ThemedText style={styles.modalButtonText}>Áp dụng & Lưu</ThemedText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Camera View */}
      <CameraView 
        style={styles.camera} 
        facing={facing}
        ref={cameraRef}
      >
        {/* Header */}
        <LinearGradient
          colors={['rgba(0,0,0,0.8)', 'transparent']}
          style={styles.headerGradient}
        >
          <ThemedView style={styles.header}>
            <Pressable style={styles.headerButton} onPress={goBack}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </Pressable>
            <ThemedText style={styles.headerTitle}>📸 Quét Sao Kê Ngân Hàng</ThemedText>
            <Pressable style={styles.headerButton} onPress={toggleCameraFacing}>
              <Ionicons name="camera-reverse" size={24} color="white" />
            </Pressable>
          </ThemedView>
        </LinearGradient>

        {/* Scanning Frame */}
        <View
          style={styles.scanningFrameContainer}
          onLayout={(e) => {
            const { width: w, height: h } = e.nativeEvent.layout;
            setCameraLayout({ width: w, height: h });
          }}
        >
          {(() => {
            const margin = 20;
            const w = Math.max(0, cameraLayout.width - margin * 2);
            const h = Math.max(0, cameraLayout.height - margin * 2);
            const frameW = Math.min(w, (h * 9) / 16);
            const frameH = (frameW * 16) / 9;
            const left = (cameraLayout.width - frameW) / 2;
            const top = (cameraLayout.height - frameH) / 2;

            return (
              <ThemedView
                style={[
                  styles.scanningFrame,
                  { top, left, width: frameW, height: frameH },
                ]}
              >
                <ThemedView style={[styles.frameCorner, styles.frameCornerTopLeft]} />
                <ThemedView style={[styles.frameCorner, styles.frameCornerTopRight]} />
                <ThemedView style={[styles.frameCorner, styles.frameCornerBottomLeft]} />
                <ThemedView style={[styles.frameCorner, styles.frameCornerBottomRight]} />
                <ThemedView style={styles.instructionContainer}>
                  <ThemedText style={styles.instructionTitle}>📱 Chụp Sao Kê</ThemedText>
                  <ThemedText style={styles.instructionText}>
                    Đặt toàn bộ sao kê trong khung
                  </ThemedText>
                  <ThemedText style={styles.instructionSubtext}>
                    Tỷ lệ 9:16 • Ánh sáng tốt • Không bóng mờ
                  </ThemedText>
                </ThemedView>
              </ThemedView>
            );
          })()}
        </View>

        {/* Bottom Controls */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          style={styles.bottomGradient}
        >
          <ThemedView style={styles.controls}>
            <Pressable style={styles.controlButton} onPress={pickImageFromGallery}>
              <ThemedView style={styles.controlButtonInner}>
                <Ionicons name="images" size={28} color="white" />
              </ThemedView>
              <ThemedText style={styles.controlLabel}>Thư Viện</ThemedText>
            </Pressable>

            <Pressable 
              style={[
                styles.captureButton,
                cameraState === 'taking_photo' && styles.captureButtonDisabled
              ]} 
              onPress={takePicture}
              disabled={cameraState === 'taking_photo'}
            >
              {cameraState === 'taking_photo' ? (
                <ActivityIndicator size="large" color="white" />
              ) : (
                <Ionicons name="camera" size={40} color="white" />
              )}
            </Pressable>

            <Pressable style={styles.controlButton} onPress={() => {
              Alert.alert(
                'Mẹo Chụp Tốt Hơn',
                '• Đảm bảo ánh sáng tốt\n• Giữ máy ảnh ổn định\n• Chụp toàn bộ sao kê\n• Tránh bóng và chói sáng\n• Sử dụng tỷ lệ 9:16',
                [{ text: 'Đã hiểu' }]
              );
            }}>
              <ThemedView style={styles.controlButtonInner}>
                <Ionicons name="help-circle" size={28} color="white" />
              </ThemedView>
              <ThemedText style={styles.controlLabel}>Mẹo</ThemedText>
            </Pressable>
          </ThemedView>

          {/* API Status */}
          {isOpenAIConfigured() && (
            <ThemedView style={styles.apiStatus}>
              <ThemedText style={styles.apiStatusText}>✓ AI đã kích hoạt</ThemedText>
            </ThemedView>
          )}
        </LinearGradient>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  cameraWrapper: {
    flex: 1,
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 20,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'transparent',
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    opacity: 0.8,
  },
  permissionButton: {
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
  },
  permissionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  headerGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    zIndex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
  },
  scanningFrameContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  scanningFrame: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#00f2fe',
    borderRadius: 16,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  frameCorner: {
    position: 'absolute',
    width: 40,
    height: 40,
    backgroundColor: 'transparent',
  },
  frameCornerTopLeft: {
    top: -3,
    left: -3,
    borderTopWidth: 6,
    borderLeftWidth: 6,
    borderColor: '#00f2fe',
    borderTopLeftRadius: 16,
  },
  frameCornerTopRight: {
    top: -3,
    right: -3,
    borderTopWidth: 6,
    borderRightWidth: 6,
    borderColor: '#00f2fe',
    borderTopRightRadius: 16,
  },
  frameCornerBottomLeft: {
    bottom: -3,
    left: -3,
    borderBottomWidth: 6,
    borderLeftWidth: 6,
    borderColor: '#00f2fe',
    borderBottomLeftRadius: 16,
  },
  frameCornerBottomRight: {
    bottom: -3,
    right: -3,
    borderBottomWidth: 6,
    borderRightWidth: 6,
    borderColor: '#00f2fe',
    borderBottomRightRadius: 16,
  },
  instructionContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  instructionTitle: {
    color: '#00f2fe',
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  instructionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  instructionSubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    textAlign: 'center',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
    justifyContent: 'flex-end',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 30,
    backgroundColor: 'transparent',
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 70,
  },
  controlButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 5,
  },
  controlLabel: {
    color: 'white',
    fontSize: 12,
    marginTop: 5,
    fontWeight: '500',
  },
  captureButton: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(0, 242, 254, 0.3)',
    borderWidth: 5,
    borderColor: '#00f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#00f2fe',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  apiStatus: {
    alignItems: 'center',
    paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  apiStatusText: {
    color: 'white',
    fontSize: 12,
    opacity: 0.8,
  },
  processingContainer: {
    flex: 1,
  },
  processingGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  processingTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 20,
    textAlign: 'center',
  },
  processingSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 10,
    textAlign: 'center',
  },
  processingSteps: {
    marginTop: 40,
    backgroundColor: 'transparent',
  },
  processingStep: {
    fontSize: 16,
    color: 'white',
    marginVertical: 8,
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    backgroundColor: '#1f1f1f',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalText: {
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalCode: {
    fontFamily: 'monospace',
    color: '#a7f3d0',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubText: {
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  modalButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});
