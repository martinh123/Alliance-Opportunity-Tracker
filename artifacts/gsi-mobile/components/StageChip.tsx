import React from 'react';
import { Text, View, StyleSheet } from 'react-native';

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  Qualify:    { bg: '#e8eeff', text: '#3d63d8' },
  Discovery:  { bg: '#f0e8ff', text: '#7c3dd8' },
  Propose:    { bg: '#fff3e0', text: '#e06c00' },
  Negotiate:  { bg: '#fff8e0', text: '#b08000' },
  Commit:     { bg: '#e0f5ed', text: '#1a7a48' },
  ClosedWon:  { bg: '#d4efdf', text: '#166534' },
  ClosedLost: { bg: '#fee2e2', text: '#b91c1c' },
  Dormant:    { bg: '#f3f4f6', text: '#6b7280' },
};

interface Props {
  stage: string;
  size?: 'sm' | 'md';
}

export function StageChip({ stage, size = 'md' }: Props) {
  const scheme = STAGE_COLORS[stage] ?? { bg: '#f3f4f6', text: '#6b7280' };
  return (
    <View style={[styles.chip, { backgroundColor: scheme.bg }, size === 'sm' && styles.chipSm]}>
      <Text style={[styles.label, { color: scheme.text }, size === 'sm' && styles.labelSm]}>
        {stage}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  chipSm: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  label: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  labelSm: { fontSize: 11 },
});
