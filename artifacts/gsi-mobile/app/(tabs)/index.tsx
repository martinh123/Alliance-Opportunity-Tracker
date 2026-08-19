import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useListOpportunities } from '@workspace/api-client-react';
import { OpportunityCard } from '@/components/OpportunityCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const STAGES = [
  'All',
  'Qualify',
  'Discovery',
  'Propose',
  'Negotiate',
  'Commit',
  'ClosedWon',
  'ClosedLost',
  'Dormant',
];

function greeting(name: string | null | undefined): string {
  const hour = new Date().getHours();
  const first = name?.split(' ')[0] ?? 'there';
  if (hour < 12) return `Good morning, ${first}`;
  if (hour < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

export default function PipelineScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [selectedStage, setSelectedStage] = useState('All');

  const params = selectedStage !== 'All' ? { stage: selectedStage } : {};
  const { data: opportunities, isLoading, refetch, isRefetching } = useListOpportunities(params);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 84 + 16 : insets.bottom + 70;

  function selectStage(stage: string) {
    Haptics.selectionAsync();
    setSelectedStage(stage);
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
        <View>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            {greeting(user?.name)}
          </Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Pipeline</Text>
        </View>
        {opportunities != null && (
          <View style={[styles.countBadge, { backgroundColor: colors.muted }]}>
            <Text style={[styles.countText, { color: colors.mutedForeground }]}>
              {opportunities.length}
            </Text>
          </View>
        )}
      </View>

      {/* Stage filters */}
      <FlatList
        data={STAGES}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s}
        contentContainerStyle={styles.filterList}
        renderItem={({ item }) => {
          const active = item === selectedStage;
          return (
            <TouchableOpacity
              style={[
                styles.chip,
                {
                  backgroundColor: active ? colors.primary : colors.muted,
                  borderColor: active ? colors.primary : colors.border,
                },
              ]}
              onPress={() => selectStage(item)}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: active ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={opportunities ?? []}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: bottomPad,
          }}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!(opportunities && opportunities.length > 0)}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="briefcase-outline" size={44} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No deals found</Text>
              <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
                {selectedStage !== 'All'
                  ? `No opportunities in ${selectedStage}`
                  : 'Your pipeline is empty'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <OpportunityCard
              opportunity={item}
              onPress={() => router.push(`/opportunity/${item.id}` as any)}
            />
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
  greeting: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold', marginTop: 2 },
  countBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  countText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  filterList: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  chip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  chipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  emptySub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
});
