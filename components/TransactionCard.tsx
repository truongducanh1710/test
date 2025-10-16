import React from 'react';
import { StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCurrency } from '@/lib/database';
import { Transaction, getTransactionColor, getCategoryIcon } from '@/types/transaction';

interface CompactTransactionCardProps {
  transaction: Transaction;
  onPress?: (transaction: Transaction) => void;
  onLongPress?: (transaction: Transaction) => void;
}

export function CompactTransactionCard({ transaction, onPress, onLongPress }: CompactTransactionCardProps) {
  const textColor = useThemeColor({}, 'text');
  const borderColor = textColor + '20';
  const amountColor = getTransactionColor(transaction.type);
  
  const handlePress = () => {
    if (onPress) {
      onPress(transaction);
    }
  };

  const handleLongPress = () => {
    if (onLongPress) {
      onLongPress(transaction);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
    
    return date.toLocaleDateString('vi-VN', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const ownerBadge = (transaction.owner_user_id && typeof transaction.owner_user_id === 'string')
    ? transaction.owner_user_id.slice(0, 1).toUpperCase()
    : null;

  return (
    <Pressable onPress={handlePress} onLongPress={handleLongPress} disabled={!onPress && !onLongPress}>
      <ThemedView style={[styles.container, { borderBottomColor: borderColor }]}>
        <ThemedView style={styles.leftSection}>
          <ThemedView style={[styles.iconContainer, { backgroundColor: amountColor + '20' }]}>
            <ThemedText style={[styles.categoryIcon, { color: amountColor }]}>
              {getCategoryIcon(transaction.category)}
            </ThemedText>
          </ThemedView>
          
          <ThemedView style={styles.infoSection}>
            <ThemedText style={[styles.description, { color: textColor }]} numberOfLines={1}>
              {transaction.description}
            </ThemedText>
            <ThemedView style={styles.metaRow}>
              <ThemedText style={[styles.category, { color: textColor }]} numberOfLines={1}>
                {transaction.category}
              </ThemedText>
              <ThemedText style={[styles.separator, { color: textColor }]}>•</ThemedText>
              <ThemedText style={[styles.date, { color: textColor }]}>
                {formatDate(transaction.date)}
              </ThemedText>
              {ownerBadge ? (
                <>
                  <ThemedText style={[styles.separator, { color: textColor }]}>•</ThemedText>
                  <ThemedView style={styles.ownerBadge}>
                    <ThemedText style={styles.ownerBadgeText}>{ownerBadge}</ThemedText>
                  </ThemedView>
                </>
              ) : null}
              {transaction.source === 'ai' && (
                <>
                  <ThemedText style={[styles.separator, { color: textColor }]}>•</ThemedText>
                  <Ionicons name="sparkles" size={12} color="#6366f1" />
                </>
              )}
            </ThemedView>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.rightSection}>
          <ThemedText style={[styles.amount, { color: amountColor }]}>
            {transaction.type === 'expense' ? '-' : '+'}
            {formatCurrency(transaction.amount)}
          </ThemedText>
        </ThemedView>
      </ThemedView>
    </Pressable>
  );
}

// Full transaction card for detailed views
interface TransactionCardProps {
  transaction: Transaction;
  onPress?: (transaction: Transaction) => void;
  onLongPress?: (transaction: Transaction) => void;
  onEdit?: (transaction: Transaction) => void;
  onDelete?: (transaction: Transaction) => void;
  hideDate?: boolean;
}

export function TransactionCard({ transaction, onPress, onLongPress, onEdit, onDelete, hideDate }: TransactionCardProps) {
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');
  const borderColor = textColor + '20';
  const tintColor = useThemeColor({}, 'tint');
  const amountColor = getTransactionColor(transaction.type);

  const handlePress = () => {
    if (onPress) {
      onPress(transaction);
    }
  };

  const handleEdit = () => {
    if (onEdit) {
      onEdit(transaction);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(transaction);
    }
  };

  const handleLongPress = () => {
    if (onLongPress) {
      onLongPress(transaction);
    }
  };

  const formatFullDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Pressable onPress={handlePress} onLongPress={handleLongPress} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      <ThemedView style={[styles.fullCard, { backgroundColor, borderColor }]}>
        <ThemedView style={styles.fullCardHeader}>
          <ThemedView style={styles.leftSection}>
            <ThemedView style={[styles.iconContainer, { backgroundColor: amountColor + '20' }]}>
              <ThemedText style={[styles.categoryIcon, { color: amountColor }]}>
                {getCategoryIcon(transaction.category)}
              </ThemedText>
            </ThemedView>
            
            <ThemedView style={styles.infoSection}>
              <ThemedText style={[styles.description, { color: textColor }]}>
                {transaction.description}
              </ThemedText>
              <ThemedText style={styles.category}>
                {transaction.category}
              </ThemedText>
            </ThemedView>
          </ThemedView>

          <ThemedView style={styles.rightSection}>
            <ThemedText style={[styles.amount, { color: amountColor }]}>
              {transaction.type === 'expense' ? '-' : '+'}
              {formatCurrency(transaction.amount)}
            </ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={styles.fullCardFooter}>
          <ThemedView style={styles.metaInfo}>
            {!hideDate && (
              <ThemedText style={styles.dateText}>
                {formatFullDate(transaction.date)}
              </ThemedText>
            )}
            {transaction.source === 'ai' && (
              <ThemedView style={styles.aiTag}>
                <Ionicons name="sparkles" size={12} color="#6366f1" />
                <ThemedText style={styles.aiTagText}>AI Extracted</ThemedText>
              </ThemedView>
            )}
          </ThemedView>

          {(onEdit || onDelete) && (
            <ThemedView style={styles.actions}>
              {onEdit && (
                <Pressable
                  onPress={handleEdit}
                  style={[styles.actionButton, { borderColor: tintColor }]}
                >
                  <Ionicons name="pencil" size={16} color={tintColor} />
                </Pressable>
              )}
              {onDelete && (
                <Pressable
                  onPress={handleDelete}
                  style={[styles.actionButton, { borderColor: '#ef4444' }]}
                >
                  <Ionicons name="trash" size={16} color="#ef4444" />
                </Pressable>
              )}
            </ThemedView>
          )}
        </ThemedView>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    backgroundColor: 'transparent',
  },
  leftSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryIcon: {
    fontSize: 18,
  },
  infoSection: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  description: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  category: {
    fontSize: 13,
    opacity: 0.85,
    flex: 1,
    fontWeight: '500',
  },
  separator: {
    fontSize: 12,
    opacity: 0.7,
    marginHorizontal: 6,
  },
  date: {
    fontSize: 13,
    opacity: 0.85,
    fontWeight: '500',
  },
  rightSection: {
    alignItems: 'flex-end',
    backgroundColor: 'transparent',
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Full card styles
  fullCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginVertical: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  fullCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    marginBottom: 12,
  },
  fullCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  metaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    backgroundColor: 'transparent',
  },
  dateText: {
    fontSize: 14,
    opacity: 0.85,
    marginRight: 10,
    fontWeight: '500',
  },
  aiTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f120',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  aiTagText: {
    fontSize: 12,
    color: '#6366f1',
    marginLeft: 4,
    fontWeight: '500',
  },
  ownerBadge: {
    borderWidth: 1,
    borderColor: '#9993',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  ownerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    opacity: 0.8,
  },
  actions: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});
