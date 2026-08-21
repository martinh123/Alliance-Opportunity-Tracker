/**
 * Semantic design tokens synced from the GSI Tracker web app (artifacts/gsi-tracker/src/index.css).
 * Light palette mirrors the web :root values; dark palette mirrors .dark overrides.
 */

const colors = {
  light: {
    text: '#0d1829',
    tint: '#3d83f5',
    background: '#f3f5f9',
    foreground: '#0d1829',
    card: '#ffffff',
    cardForeground: '#0d1829',
    primary: '#3d83f5',
    primaryForeground: '#ffffff',
    secondary: '#edf0f4',
    secondaryForeground: '#0d1829',
    muted: '#edf0f4',
    mutedForeground: '#6d7585',
    accent: '#3d83f5',
    accentForeground: '#ffffff',
    destructive: '#ef4040',
    destructiveForeground: '#ffffff',
    border: '#d8dce7',
    input: '#d8dce7',
  },
  dark: {
    text: '#f0f4fa',
    tint: '#5a97f7',
    background: '#0b1525',
    foreground: '#f0f4fa',
    card: '#111e35',
    cardForeground: '#f0f4fa',
    primary: '#5a97f7',
    primaryForeground: '#ffffff',
    secondary: '#192035',
    secondaryForeground: '#f0f4fa',
    muted: '#192035',
    mutedForeground: '#8a9db8',
    accent: '#5a97f7',
    accentForeground: '#ffffff',
    destructive: '#f04040',
    destructiveForeground: '#ffffff',
    border: '#1e2f47',
    input: '#1e2f47',
  },
  // Matches web app --radius: 0.5rem = 8px
  radius: 8,
};

export default colors;
