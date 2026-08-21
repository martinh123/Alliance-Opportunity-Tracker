import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useListReminders, useUpdateReminder } from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

function dueBadgeColor(
  dueAt: string,
  completedAt: string | null | undefined,
  colors: ReturnType<typeof useColors>,
): string {
  if (completedAt) return colors.mutedForeground;
  const msLeft = new Date(dueAt).getTime() - Date.now();
  if (msLeft < 0) return colors.destructive;
  if (msLeft < 24 * 60 * 60 * 1000) return '#f59e0b';
  return colors.mutedForeground;
}

export default function RemindersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: reminders, isLoading, refetch, isRefetching } = useListReminders({ status: 'all' });
  const updateMutation = useUpdateReminder();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 84 + 16 : insets.bottom + 70;

  const open = (reminders ?? []).filter((r) => !r.completedAt);
  const done = (reminders ?? []).filter((r) => r.completedAt);

  async function toggle(id: number, completedAt: string | null | undefined) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await updateMutation.mutateAsync({ id, data: { completed: !completedAt } });
      refetch();
    } catch {
      // ignore
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Reminders</Text>
        {open.length > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.destructive + '22' }]}>
            <Text style={[styles.badgeText, { color: colors.destructive }]}>{open.length}</Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={[...open, ...done]}
          keyExtractor={(r) => String(r.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!(reminders && reminders.length > 0)}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-circle-outline" size={44} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>All clear</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                No upcoming reminders
              </Text>
            </View>
          }
          renderItem={({ item: rem }) => {
            const completed = !!rem.completedAt;
            const dateColor = dueBadgeColor(rem.dueAt, rem.completedAt, colors);

            return (
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border, opacity: completed ? 0.65 : 1 },
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.check,
                    {
                      borderColor: completed ? colors.primary : colors.border,
                      backgroundColor: completed ? colors.primary : 'transparent',
                    },
                  ]}
                  onPress={() => toggle(rem.id, rem.completedAt)}
                  activeOpacity={0.7}
                >
                  {completed && <Ionicons name="checkmark" size={13} color="#fff" />}
                </TouchableOpacity>

                <View style={styles.body}>
                  <Text
                    style={[
                      styles.remName,
                      {
                        color: colors.foreground,
                        textDecorationLine: completed ? 'line-through' : 'none',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {rem.name}
                  </Text>
                  <View style={styles.metaRow}>
                    <Ionicons name="calendar-outline" size={12} color={dateColor} />
                    <Text style={[styles.dateTxt, { color: dateColor }]}>
                      {new Date(rem.dueAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </Text>
                    {rem.entityLabel ? (
                      <>
                        <Text style={[styles.dot, { color: colors.mutedForeground }]}>·</Text>
                        <Text style={[styles.entity, { color: colors.mutedForeground }]}>
                          {rem.entityLabel}
                        </Text>
                      </>
                    ) : null}
                  </View>
                  {rem.notes ? (
                    <Text style={[styles.notes, { color: colors.mutedForeground }]} numberOfLines={1}>
                      {rem.notes}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  body: { flex: 1 },
  remName: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateTxt: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  dot: { fontSize: 11 },
  entity: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  notes: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 },
});
