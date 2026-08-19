import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { useLogin } from '@workspace/api-client-react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import * as Haptics from 'expo-haptics';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, isLoading: authLoading, setSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const loginMutation = useLogin();

  // Redirect when already authenticated
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/(tabs)');
    }
  }, [user, authLoading]);

  if (authLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setError('');
    try {
      const result = await loginMutation.mutateAsync({ data: { email: email.trim(), password } });
      if (result.token) {
        await setSession(result.user, result.token);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/(tabs)');
      } else {
        setError('Sign-in failed: no token returned. Contact your admin.');
      }
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg =
        err?.data?.error ?? err?.message ?? 'Invalid credentials. Please try again.';
      setError(msg);
    }
  }

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: topPad + 48,
        paddingHorizontal: 24,
        paddingBottom: bottomPad + 24,
      }}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
      {/* Brand mark */}
      <View style={styles.brand}>
        <View style={[styles.logoWrap, { backgroundColor: colors.primary }]}>
          <Ionicons name="layers-outline" size={40} color="#fff" />
        </View>
        <Text style={[styles.appName, { color: colors.foreground }]}>GSI Tracker</Text>
        <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
          Partner Opportunity Pipeline
        </Text>
      </View>

      {/* Sign-in card */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Welcome back</Text>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Email</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.background, borderColor: colors.input, color: colors.foreground },
            ]}
            value={email}
            onChangeText={setEmail}
            placeholder="you@company.com"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            returnKeyType="next"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>Password</Text>
          <TextInput
            style={[
              styles.input,
              { backgroundColor: colors.background, borderColor: colors.input, color: colors.foreground },
            ]}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            autoComplete="password"
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />
        </View>

        {!!error && (
          <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
        )}

        <TouchableOpacity
          style={[
            styles.btn,
            { backgroundColor: colors.primary, opacity: loginMutation.isPending ? 0.75 : 1 },
          ]}
          onPress={handleLogin}
          disabled={loginMutation.isPending}
          activeOpacity={0.85}
        >
          {loginMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.btnText}>Sign in</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  brand: { alignItems: 'center', marginBottom: 36 },
  logoWrap: {
    width: 84,
    height: 84,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  appName: { fontSize: 26, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  tagline: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  card: { borderRadius: 16, borderWidth: 1, padding: 24 },
  cardTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', marginBottom: 24 },
  field: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  error: { fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 12 },
  btn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
