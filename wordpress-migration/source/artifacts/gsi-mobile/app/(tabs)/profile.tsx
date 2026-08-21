import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useGetProfile } from '@workspace/api-client-react';
import * as Haptics from 'expo-haptics';

function fmt(val: number | null | undefined): string {
  if (!val) return '—';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val}`;
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, clearSession } = useAuth();
  const router = useRouter();
  const { data: profile } = useGetProfile();

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 84 + 24 : insets.bottom + 70;

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await clearSession();
          router.replace('/');
        },
      },
    ]);
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
        <Text style={[styles.title, { color: colors.foreground }]}>Profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
      >
        {/* User card */}
        <View style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.avatar, { backgroundColor: colors.primary + '20' }]}>
            <Text style={[styles.avatarText, { color: colors.primary }]}>
              {user?.name?.slice(0, 2).toUpperCase() ?? 'U'}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: colors.foreground }]}>{user?.name ?? '—'}</Text>
            <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>
              {user?.email ?? '—'}
            </Text>
            <View style={[styles.roleBadge, { backgroundColor: colors.primary + '18' }]}>
              <Text style={[styles.roleText, { color: colors.primary }]}>
                {user?.role === 'admin' ? 'Administrator' : 'Sales Rep'}
              </Text>
            </View>
          </View>
        </View>

        {/* Pipeline settings */}
        {profile ? (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
              PIPELINE SETTINGS
            </Text>
            <SettingRow
              label="Revenue Metric"
              value={profile.revenueMetric}
              colors={colors}
            />
            <SettingDivider colors={colors} />
            <SettingRow
              label="Fiscal Year"
              value={`Month ${profile.fiscalYearStart} – ${profile.fiscalYearEnd}`}
              colors={colors}
            />
            {profile.quota != null ? (
              <>
                <SettingDivider colors={colors} />
                <SettingRow label="Quota" value={fmt(profile.quota)} colors={colors} />
              </>
            ) : null}
          </View>
        ) : null}

        {/* Territory */}
        {user?.region ? (
          <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>TERRITORY</Text>
            <SettingRow label="Region" value={user.region} colors={colors} />
          </View>
        ) : null}

        {/* Sign out */}
        <TouchableOpacity
          style={[
            styles.signOut,
            { borderColor: colors.destructive + '55', backgroundColor: colors.destructive + '0f' },
          ]}
          onPress={handleSignOut}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.destructive} />
          <Text style={[styles.signOutText, { color: colors.destructive }]}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function SettingRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>{value}</Text>
    </View>
  );
}

function SettingDivider({ colors }: { colors: ReturnType<typeof useColors> }) {
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  userCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  userInfo: { flex: 1 },
  userName: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  userEmail: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2, marginBottom: 6 },
  roleBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  roleText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  section: { borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowLabel: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  rowValue: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  divider: { height: 1, marginHorizontal: 16 },
  signOut: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  signOutText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
