import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';

export const ELEMENT_LABELS: Record<string, string> = {
  metrics:           'Metrics',
  economic_buyer:    'Economic Buyer',
  decision_criteria: 'Decision Criteria',
  decision_process:  'Decision Process',
  paper_process:     'Paper Process',
  identify_pain:     'Identify Pain',
  champion:          'Champion',
  competition:       'Competition',
};

export function scoreColor(score: number): string {
  if (score >= 70) return '#22c55e';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}

interface ElementEntry {
  element: string;
  score: number;
  completionPct: number;
  weight: number;
}

export function MeddpiccElementBar({ element }: { element: ElementEntry }) {
  const colors = useColors();
  const label = ELEMENT_LABELS[element.element] ?? element.element;
  const color = scoreColor(element.score);
  const pct = Math.round(element.score);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
        <Text style={[styles.score, { color }]}>{pct}%</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.border }]}>
        <View
          style={[styles.fill, { width: `${Math.min(100, Math.max(0, pct))}%` as any, backgroundColor: color }]}
        />
      </View>
    </View>
  );
}

export function MeddpiccScoreCircle({ score, size = 'lg' }: { score: number; size?: 'sm' | 'lg' }) {
  const colors = useColors();
  const color = scoreColor(score);
  const isLg = size === 'lg';

  return (
    <View
      style={[
        styles.circle,
        isLg && styles.circleLg,
        { borderColor: color, backgroundColor: color + '1a' },
      ]}
    >
      <Text style={[styles.circleScore, isLg && styles.circleScoreLg, { color }]}>
        {Math.round(score)}
      </Text>
      <Text style={[styles.circleUnit, { color: colors.mutedForeground }]}>/ 100</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  score: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  circle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleLg: { width: 96, height: 96, borderRadius: 48, borderWidth: 4 },
  circleScore: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  circleScoreLg: { fontSize: 30 },
  circleUnit: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: -2 },
});
