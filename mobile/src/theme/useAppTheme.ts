import { useColorScheme } from "react-native";

export type ThemeMode = "light" | "dark";

interface ThemeFonts {
  regular: string;
  medium: string;
  semibold: string;
  bold: string;
  heavy: string;
}

interface ThemeColors {
  background: string;
  backgroundStrong: string;
  surface: string;
  surfaceSoft: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  primaryContrast: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  inputBg: string;
  ring: string;
}

interface ThemeRadii {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  pill: number;
}

interface ThemeSpacing {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

interface ThemeShadows {
  color: string;
  cardOpacity: number;
  cardRadius: number;
  cardElevation: number;
}

export interface AppTheme {
  mode: ThemeMode;
  colors: ThemeColors;
  fonts: ThemeFonts;
  radii: ThemeRadii;
  spacing: ThemeSpacing;
  shadows: ThemeShadows;
}

const sharedFonts: ThemeFonts = {
  regular: "Manrope_400Regular",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
  heavy: "Manrope_800ExtraBold",
};

const sharedRadii: ThemeRadii = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

const sharedSpacing: ThemeSpacing = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 30,
};

const lightTheme: AppTheme = {
  mode: "light",
  fonts: sharedFonts,
  radii: sharedRadii,
  spacing: sharedSpacing,
  shadows: {
    color: "#0b243d",
    cardOpacity: 0.12,
    cardRadius: 12,
    cardElevation: 3,
  },
  colors: {
    background: "#f2f8ff",
    backgroundStrong: "#e9f2ff",
    surface: "#ffffff",
    surfaceSoft: "#f7fbff",
    border: "#d8e6f3",
    borderStrong: "#bfd8ec",
    textPrimary: "#0a2b49",
    textSecondary: "#385f80",
    textMuted: "#6f8ba4",
    primary: "#1cd3e2",
    primaryStrong: "#0ea4ce",
    primarySoft: "#d9f8ff",
    primaryContrast: "#ffffff",
    success: "#1f9e63",
    warning: "#dd8c10",
    danger: "#ce3d52",
    info: "#2a7ce2",
    inputBg: "#f5fbff",
    ring: "#82dffc",
  },
};

const darkTheme: AppTheme = {
  mode: "dark",
  fonts: sharedFonts,
  radii: sharedRadii,
  spacing: sharedSpacing,
  shadows: {
    color: "#000000",
    cardOpacity: 0.28,
    cardRadius: 14,
    cardElevation: 5,
  },
  colors: {
    background: "#071626",
    backgroundStrong: "#0d2236",
    surface: "#0f2438",
    surfaceSoft: "#15314c",
    border: "#1f3a53",
    borderStrong: "#2f506f",
    textPrimary: "#e8f4ff",
    textSecondary: "#b9d3ea",
    textMuted: "#89a8c3",
    primary: "#1cd3e2",
    primaryStrong: "#20aee4",
    primarySoft: "#133f5a",
    primaryContrast: "#031824",
    success: "#38d385",
    warning: "#f1ad3a",
    danger: "#ff6e85",
    info: "#70b1ff",
    inputBg: "#163149",
    ring: "#3ec5ff",
  },
};

export function useAppTheme(): AppTheme {
  const scheme = useColorScheme();
  return scheme === "dark" ? darkTheme : lightTheme;
}
