import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure foreground handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermissions(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }
  const req = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      allowAnnouncements: false,
    },
  });
  return req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL || false;
}

export async function notifyBudgetThreshold(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null, // immediate
  });
}

export async function scheduleDailyDigest(hour = 9) {
  // Schedule a repeating local notification at the given hour local time
  await Notifications.cancelScheduledNotificationAsync('budget-digest' as any).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Tổng hợp tài chính',
      body: 'Kiểm tra ngân sách và các khoản vay/cho vay sắp đến hạn',
    },
    trigger: {
      hour,
      minute: 0,
      repeats: true,
      channelId: Platform.OS === 'android' ? 'budget-digest' : undefined,
    } as any,
  });
}

export async function setupAndroidChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('budget-digest', {
    name: 'Budget Digest',
    importance: Notifications.AndroidImportance.DEFAULT,
    description: 'Daily budget summary',
  });
}

export async function cancelHabitReminders() {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      (all || [])
        .filter((n) => n.content?.title === 'Đừng quên ghi chi tiêu hôm nay')
        .map((n) => Notifications.cancelScheduledNotificationAsync((n as any).identifier))
    );
  } catch {}
}

export async function scheduleDailyHabitReminder(hour = 20) {
  try {
    // Avoid duplicates: cancel any existing habit reminders
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      (all || [])
        .filter((n) => n.content?.title === 'Đừng quên ghi chi tiêu hôm nay')
        .map((n) => Notifications.cancelScheduledNotificationAsync((n as any).identifier))
    );
  } catch {}

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Đừng quên ghi chi tiêu hôm nay',
      body: 'Chỉ một giao dịch để duy trì streak!',
      data: { action: 'open-add-transaction' },
    },
    trigger: { hour, minute: 0, repeats: true } as any,
  });
}


