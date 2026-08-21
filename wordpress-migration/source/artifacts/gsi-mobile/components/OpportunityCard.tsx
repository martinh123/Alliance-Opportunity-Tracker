import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { StageChip } from './StageChip';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

function formatValue(val: number | null | undefined): string {
  if (!val) return '—';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

function meddpiccColor(score: number | null | undefined): string {
  if (score == null) return '';
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

interface OpportunityLike {
  id: number;
  name: string;
  type: string;
  stage: string;
  partnerName?: string | null;
  revenueValue?: number | null;
  meddpiccScore?: number | null;
  closeDate?: string | null;
}

interface Props {
  opportunity: OpportunityLike;
  onPress: () => void;
}

export function OpportunityCard({ opportunity, onPress }: Props) {
  const colors = useColors();
  const color = meddpiccColor(opportunity.meddpiccScore);
  const score = opportunity.meddpiccScore != null ? Math.round(opportunity.meddpiccScore) : null;

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      <View style={styles.main}>
        <View style={styles.left}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
              {opportunity.name}
            </Text>
            {opportunity.type === 'initiative' && (
              <View style={[styles.typeBadge, { backgroundColor: colors.muted }]}>
                <Text style={[styles.typeText, { color: colors.mutedForeground }]}>Init.</Text>
              </View>
            )}
          </View>
          <StageChip stage={opportunity.stage} size="sm" />
          {opportunity.partnerName ? (
            <Text style={[styles.partner, { color: colors.mutedForeground }]} numberOfLines={1}>
              {opportunity.partnerName}
            </Text>
          ) : null}
        </View>

        <View style={styles.right}>
          <Text style={[styles.value, { color: colors.foreground }]}>
            {formatValue(opportunity.revenueValue)}
          </Text>
          {score != null ? (
            <View
              style={[
                styles.scoreChip,
                { borderColor: color + '66', backgroundColor: color + '18' },
              ]}
            >
              <Text style={[styles.scoreText, { color }]}>{score}</Text>
            </View>
          ) : (
            <View style={[styles.scoreChip, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Text style={[styles.scoreText, { color: colors.mutedForeground }]}>—</Text>
            </View>
          )}
          {opportunity.closeDate ? (
            <Text style={[styles.closeDate, { color: colors.mutedForeground }]}>
              {new Date(opportunity.closeDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} style={styles.chevron} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  main: { flex: 1, flexDirection: 'row', gap: 10 },
  left: { flex: 1, gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flex: 1 },
  typeBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  typeText: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  partner: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  right: { alignItems: 'flex-end', gap: 6 },
  value: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  scoreChip: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 34,
    alignItems: 'center',
  },
  scoreText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  closeDate: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  chevron: { marginLeft: 4 },
});
