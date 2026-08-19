import React from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useListPartners } from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

function formatTarget(val: number | null | undefined): string {
  if (!val) return '';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val}`;
}

export default function PartnersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { data: partners, isLoading, refetch, isRefetching } = useListPartners();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 84 + 16 : insets.bottom + 70;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Partners</Text>
        {partners != null && (
          <View style={[styles.badge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
              {partners.length}
            </Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={partners ?? []}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!(partners && partners.length > 0)}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={44} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No partners yet</Text>
            </View>
          }
          renderItem={({ item: partner }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardTop}>
                <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
                  <Text style={[styles.avatarText, { color: colors.primary }]}>
                    {partner.name.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.info}>
                  <Text style={[styles.name, { color: colors.foreground }]}>{partner.name}</Text>
                  <View style={styles.metaRow}>
                    {partner.tier ? (
                      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                        {partner.tier}
                      </Text>
                    ) : null}
                    {partner.tier && partner.region ? (
                      <Text style={[styles.dot, { color: colors.mutedForeground }]}>·</Text>
                    ) : null}
                    {partner.region ? (
                      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
                        {partner.region}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {partner.revenueTarget ? (
                  <View style={styles.target}>
                    <Text style={[styles.targetLabel, { color: colors.mutedForeground }]}>
                      Target
                    </Text>
                    <Text style={[styles.targetValue, { color: colors.foreground }]}>
                      {formatTarget(partner.revenueTarget)}
                    </Text>
                  </View>
                ) : null}
              </View>

              {(partner.contactName || partner.contactEmail) ? (
                <View
                  style={[styles.contact, { borderTopColor: colors.border }]}
                >
                  <Ionicons name="person-outline" size={12} color={colors.mutedForeground} />
                  <Text style={[styles.contactText, { color: colors.mutedForeground }]}>
                    {partner.contactName ?? partner.contactEmail}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
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
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  info: { flex: 1 },
  name: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  meta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  dot: { fontSize: 12 },
  target: { alignItems: 'flex-end' },
  targetLabel: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  targetValue: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  contactText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
});
