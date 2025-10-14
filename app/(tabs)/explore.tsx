import { ScrollView, StyleSheet, Pressable, Dimensions, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';

const { width } = Dimensions.get('window');

export default function ProfileScreen() {
  const backgroundColor = useThemeColor({}, 'background');
  const tintColor = useThemeColor({}, 'tint');

  const handleEditProfile = () => {
    Alert.alert('Edit Profile', 'Profile editing feature coming soon!');
  };

  const handleSetting = (setting: string) => {
    Alert.alert('Settings', `${setting} clicked!`);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor }]} showsVerticalScrollIndicator={false}>
      
      {/* Profile Header with Gradient */}
      <LinearGradient
        colors={['#4facfe', '#00f2fe']}
        style={styles.profileHeader}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <ThemedView style={styles.avatarContainer}>
          <ThemedView style={styles.avatar}>
            <Ionicons name="person" size={60} color="white" />
          </ThemedView>
          <ThemedText style={styles.userName}>John Doe</ThemedText>
          <ThemedText style={styles.userEmail}>john.doe@example.com</ThemedText>
          
          <Pressable style={styles.editButton} onPress={handleEditProfile}>
            <Ionicons name="pencil" size={16} color="white" />
            <ThemedText style={styles.editButtonText}>Edit Profile</ThemedText>
          </Pressable>
        </ThemedView>
      </LinearGradient>

      {/* Stats Cards */}
      <ThemedView style={styles.statsContainer}>
        <ThemedView style={styles.statCard}>
          <ThemedText style={styles.statNumber}>127</ThemedText>
          <ThemedText style={styles.statLabel}>Projects</ThemedText>
        </ThemedView>
        <ThemedView style={styles.statCard}>
          <ThemedText style={styles.statNumber}>1.2K</ThemedText>
          <ThemedText style={styles.statLabel}>Followers</ThemedText>
        </ThemedView>
        <ThemedView style={styles.statCard}>
          <ThemedText style={styles.statNumber}>856</ThemedText>
          <ThemedText style={styles.statLabel}>Following</ThemedText>
        </ThemedView>
      </ThemedView>

      {/* Menu Items */}
      <ThemedView style={styles.menuContainer}>
        <ThemedText type="title" style={styles.menuTitle}>Account Settings</ThemedText>
        
        <Pressable 
          style={[styles.menuItem, { borderBottomColor: tintColor + '20' }]}
          onPress={() => handleSetting('Personal Information')}
        >
          <ThemedView style={[styles.menuIconContainer, { backgroundColor: '#ff6b6b' }]}>
            <Ionicons name="person-outline" size={20} color="white" />
          </ThemedView>
          <ThemedView style={styles.menuTextContainer}>
            <ThemedText style={styles.menuItemTitle}>Personal Information</ThemedText>
            <ThemedText style={styles.menuItemSubtitle}>Update your details</ThemedText>
          </ThemedView>
          <Ionicons name="chevron-forward" size={20} color={tintColor} />
        </Pressable>

        <Pressable 
          style={[styles.menuItem, { borderBottomColor: tintColor + '20' }]}
          onPress={() => handleSetting('Security')}
        >
          <ThemedView style={[styles.menuIconContainer, { backgroundColor: '#4ecdc4' }]}>
            <Ionicons name="shield-outline" size={20} color="white" />
          </ThemedView>
          <ThemedView style={styles.menuTextContainer}>
            <ThemedText style={styles.menuItemTitle}>Security</ThemedText>
            <ThemedText style={styles.menuItemSubtitle}>Password & privacy</ThemedText>
          </ThemedView>
          <Ionicons name="chevron-forward" size={20} color={tintColor} />
        </Pressable>

        <Pressable 
          style={[styles.menuItem, { borderBottomColor: tintColor + '20' }]}
          onPress={() => handleSetting('Notifications')}
        >
          <ThemedView style={[styles.menuIconContainer, { backgroundColor: '#667eea' }]}>
            <Ionicons name="notifications-outline" size={20} color="white" />
          </ThemedView>
          <ThemedView style={styles.menuTextContainer}>
            <ThemedText style={styles.menuItemTitle}>Notifications</ThemedText>
            <ThemedText style={styles.menuItemSubtitle}>Manage your alerts</ThemedText>
          </ThemedView>
          <Ionicons name="chevron-forward" size={20} color={tintColor} />
        </Pressable>

        <Pressable 
          style={[styles.menuItem, { borderBottomColor: tintColor + '20' }]}
          onPress={() => handleSetting('Appearance')}
        >
          <ThemedView style={[styles.menuIconContainer, { backgroundColor: '#f093fb' }]}>
            <Ionicons name="color-palette-outline" size={20} color="white" />
          </ThemedView>
          <ThemedView style={styles.menuTextContainer}>
            <ThemedText style={styles.menuItemTitle}>Appearance</ThemedText>
            <ThemedText style={styles.menuItemSubtitle}>Theme & display</ThemedText>
          </ThemedView>
          <Ionicons name="chevron-forward" size={20} color={tintColor} />
        </Pressable>

        <Pressable 
          style={[styles.menuItem, { borderBottomWidth: 0 }]}
          onPress={() => handleSetting('Help & Support')}
        >
          <ThemedView style={[styles.menuIconContainer, { backgroundColor: '#ffa726' }]}>
            <Ionicons name="help-circle-outline" size={20} color="white" />
          </ThemedView>
          <ThemedView style={styles.menuTextContainer}>
            <ThemedText style={styles.menuItemTitle}>Help & Support</ThemedText>
            <ThemedText style={styles.menuItemSubtitle}>Get assistance</ThemedText>
          </ThemedView>
          <Ionicons name="chevron-forward" size={20} color={tintColor} />
        </Pressable>
      </ThemedView>

      {/* Logout Button */}
      <ThemedView style={styles.logoutContainer}>
        <Pressable 
          style={styles.logoutButton}
          onPress={() => Alert.alert('Logout', 'Are you sure you want to logout?')}
        >
          <Ionicons name="log-out-outline" size={24} color="#ff6b6b" />
          <ThemedText style={styles.logoutText}>Logout</ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileHeader: {
    height: 280,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  avatarContainer: {
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 4,
    borderColor: 'white',
  },
  userName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5,
  },
  userEmail: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 20,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'white',
  },
  editButtonText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: -40,
    marginHorizontal: 20,
    backgroundColor: 'transparent',
  },
  statCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
    minWidth: 100,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4facfe',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  menuContainer: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    padding: 20,
    paddingBottom: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    backgroundColor: 'transparent',
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  menuTextContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  menuItemSubtitle: {
    fontSize: 14,
    opacity: 0.6,
  },
  logoutContainer: {
    margin: 20,
    backgroundColor: 'transparent',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ff6b6b',
    backgroundColor: 'transparent',
  },
  logoutText: {
    color: '#ff6b6b',
    marginLeft: 10,
    fontSize: 16,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 50,
    backgroundColor: 'transparent',
  },
});
