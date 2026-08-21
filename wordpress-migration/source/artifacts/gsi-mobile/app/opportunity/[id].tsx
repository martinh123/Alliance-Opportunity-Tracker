import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useGetOpportunity, useGetMeddpicc } from '@workspace/api-client-react';
import { StageChip } from '@/components/StageChip';
import { MeddpiccElementBar, MeddpiccScoreCircle } from '@/components/MeddpiccScoreBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

function formatValue(val: number | null | undefined): string {
  if (!val) return '—';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface MetricRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}

function MetricRow({ icon, label, value, colors }: MetricRowProps) {
  return (
    <View style={styles.metricRow}>
      <Ionicons name={icon} size={15} color={colors.mutedForeground} style={styles.metricIcon} />
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

export default function OpportunityDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const opportunityId = Number(id);

  const { data: opp, isLoading: oppLoading } = useGetOpportunity(opportunityId);
  const { data: meddpicc, isLoading: meddLoading } = useGetMeddpicc(opportunityId);

  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom + 24;

  if (oppLoading || meddLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!opp) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={[styles.notFound, { color: colors.foreground }]}>Opportunity not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: bottomPad }}
      showsVerticalScrollIndicator={false}
    >
      {/* Deal name + badges */}
      <Text style={[styles.dealName, { color: colors.foreground }]}>{opp.name}</Text>
      <View style={styles.badgeRow}>
        <StageChip stage={opp.stage} />
        <View style={[styles.typeBadge, { backgroundColor: colors.muted }]}>
          <Text style={[styles.typeBadgeText, { color: colors.mutedForeground }]}>
            {opp.type === 'initiative' ? 'Initiative' : 'Opportunity'}
          </Text>
        </View>
      </View>

      {/* Key facts */}
      <View style={[styles.factsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <MetricRow icon="business-outline" label="Partner" value={opp.partnerName ?? '—'} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <MetricRow icon="cash-outline" label="Value" value={formatValue(opp.revenueValue)} colors={colors} />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <MetricRow icon="calendar-outline" label="Close Date" value={formatDate(opp.closeDate)} colors={colors} />
        {opp.endCustomer ? (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <MetricRow icon="storefront-outline" label="End Customer" value={opp.endCustomer} colors={colors} />
          </>
        ) : null}
        {opp.country ? (
          <>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <MetricRow icon="location-outline" label="Country" value={opp.country} colors={colors} />
          </>
        ) : null}
      </View>

      {/* MEDDPICC score */}
      {meddpicc ? (
        <>
          <View style={styles.meddHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>MEDDPICC</Text>
              <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
                Qualification score
              </Text>
            </View>
            <MeddpiccScoreCircle score={meddpicc.overallScore} size="lg" />
          </View>

          <View style={[styles.meddCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {meddpicc.elements.map((el) => (
              <MeddpiccElementBar key={el.element} element={el} />
            ))}
          </View>
        </>
      ) : null}

      {/* Notes */}
      {opp.notes && opp.notes.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 24 }]}>
            Notes
          </Text>
          <View
            style={[styles.notesCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            {opp.notes.map((note, idx) => (
              <View
                key={note.id}
                style={[
                  styles.noteItem,
                  idx > 0 && { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 12, paddingTop: 12 },
                ]}
              >
                <Text style={[styles.noteText, { color: colors.foreground }]}>{note.text}</Text>
                <Text style={[styles.noteDate, { color: colors.mutedForeground }]}>
                  {formatDate(note.createdAt)}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: 16, fontFamily: 'Inter_400Regular' },
  dealName: { fontSize: 22, fontFamily: 'Inter_700Bold', marginBottom: 10, lineHeight: 28 },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  typeBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  typeBadgeText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  factsCard: { borderRadius: 12, borderWidth: 1, marginBottom: 28 },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  metricIcon: { marginRight: 10 },
  metricLabel: { fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 },
  metricValue: { fontSize: 14, fontFamily: 'Inter_600SemiBold', textAlign: 'right', flex: 1 },
  divider: { height: 1, marginHorizontal: 16 },
  meddHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 17, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  sectionSub: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  meddCard: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 8 },
  notesCard: { borderRadius: 12, borderWidth: 1, padding: 16 },
  noteItem: {},
  noteText: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20, marginBottom: 4 },
  noteDate: { fontSize: 11, fontFamily: 'Inter_400Regular' },
});
