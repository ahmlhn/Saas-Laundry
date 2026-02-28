import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppPanel } from "../../components/ui/AppPanel";
import { extractCustomerPhoneDigits, formatCustomerPhoneDisplay } from "../../features/customers/customerPhone";
import { parseCustomerProfileMeta } from "../../features/customers/customerProfileNote";
import { hasAnyRole } from "../../lib/accessControl";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

type CustomerDetailRoute = RouteProp<AccountStackParamList, "CustomerDetail">;
type CustomerDetailNavigation = NativeStackNavigationProp<AccountStackParamList, "CustomerDetail">;

interface DetailRow {
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  muted?: boolean;
}

function mapGender(gender: string): string {
  if (gender === "male") {
    return "Laki-laki";
  }
  if (gender === "female") {
    return "Perempuan";
  }
  return "Tidak terdefinisi";
}

function formatRegisteredDate(createdAt: string): string {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function CustomerDetailScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const route = useRoute<CustomerDetailRoute>();
  const navigation = useNavigation<CustomerDetailNavigation>();
  const { session } = useSession();

  const customer = route.params.customer;
  const roles = session?.roles ?? [];
  const canCreateOrEdit = hasAnyRole(roles, ["owner", "admin", "cashier"]);

  const [expanded, setExpanded] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const profileMeta = useMemo(() => parseCustomerProfileMeta(customer.notes), [customer.notes]);
  const normalizedPhone = useMemo(() => extractCustomerPhoneDigits(customer.phone_normalized), [customer.phone_normalized]);
  const phoneDisplay = useMemo(() => formatCustomerPhoneDisplay(customer.phone_normalized), [customer.phone_normalized]);
  const registeredDate = useMemo(() => formatRegisteredDate(customer.created_at), [customer.created_at]);

  const profileRows = useMemo<DetailRow[]>(
    () => [
      {
        iconName: "phone-portrait-outline",
        label: "Telepon",
        value: phoneDisplay,
        muted: !normalizedPhone,
      },
      {
        iconName: "location-outline",
        label: "Alamat",
        value: profileMeta.address || "Tidak ada alamat",
        muted: !profileMeta.address,
      },
    ],
    [phoneDisplay, normalizedPhone, profileMeta.address]
  );

  const extraRows = useMemo<DetailRow[]>(
    () => [
      {
        iconName: "mail-outline",
        label: "Email",
        value: profileMeta.email || "Tidak ada email",
        muted: !profileMeta.email,
      },
      {
        iconName: "calendar-outline",
        label: "Tanggal Lahir",
        value: profileMeta.birthDate || "Tidak diketahui",
        muted: !profileMeta.birthDate,
      },
      {
        iconName: "transgender-outline",
        label: "Gender",
        value: mapGender(profileMeta.gender),
        muted: !profileMeta.gender,
      },
      {
        iconName: "document-text-outline",
        label: "Catatan",
        value: profileMeta.note || "Tidak ada catatan",
        muted: !profileMeta.note,
      },
    ],
    [profileMeta]
  );

  async function openCustomerAction(action: "wa" | "tel"): Promise<void> {
    if (!normalizedPhone) {
      setErrorMessage("Nomor telepon pelanggan belum tersedia.");
      return;
    }

    const targetUrl = action === "wa" ? `https://wa.me/${normalizedPhone}` : `tel:${normalizedPhone}`;

    try {
      const supported = await Linking.canOpenURL(targetUrl);
      if (!supported) {
        setErrorMessage(action === "wa" ? "WhatsApp tidak tersedia di perangkat ini." : "Aplikasi telepon tidak tersedia di perangkat ini.");
        return;
      }

      await Linking.openURL(targetUrl);
      setErrorMessage(null);
    } catch {
      setErrorMessage("Gagal menjalankan aksi pelanggan.");
    }
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <View style={styles.heroCard}>
        <View style={styles.heroLayerPrimary} />
        <View style={styles.heroLayerSecondary} />
        <View style={styles.heroGlow} />

        <View style={styles.heroContent}>
          <View style={styles.heroTopRow}>
            <Pressable onPress={() => navigation.goBack()} style={styles.topIconButton}>
              <Ionicons color="#eaf6ff" name="arrow-back" size={21} />
            </Pressable>

            <View style={styles.heroBrandWrap}>
              <Text style={styles.brandText}>Laundry Poin</Text>
              <Text style={styles.heroSubtitle}>Detail Pelanggan</Text>
            </View>

            {canCreateOrEdit ? (
              <Pressable
                onPress={() =>
                  navigation.navigate("CustomerForm", {
                    mode: "edit",
                    customer,
                  })
                }
                style={styles.topIconButton}
              >
                <Ionicons color="#eaf6ff" name="create-outline" size={19} />
              </Pressable>
            ) : (
              <View style={styles.topIconGhost} />
            )}
          </View>

          <Text numberOfLines={2} style={styles.customerName}>
            {customer.name}
          </Text>

          <View style={styles.heroMetaRow}>
            <View style={styles.heroChip}>
              <Ionicons color="#dff1ff" name="calendar-outline" size={12} />
              <Text style={styles.heroChipText}>Terdaftar {registeredDate}</Text>
            </View>
            <View style={styles.heroChip}>
              <Ionicons color="#dff1ff" name="call-outline" size={12} />
              <Text numberOfLines={1} style={styles.heroChipText}>
                {phoneDisplay}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.quickActionRow}>
        <Pressable onPress={() => void openCustomerAction("wa")} style={({ pressed }) => [styles.quickActionButton, pressed ? styles.quickActionPressed : null]}>
          <View style={[styles.quickActionIcon, styles.quickActionIconWa]}>
            <Ionicons color={theme.colors.success} name="logo-whatsapp" size={20} />
          </View>
          <Text style={styles.quickActionTitle}>WhatsApp</Text>
          <Text style={styles.quickActionSubtitle}>Kirim chat langsung</Text>
        </Pressable>

        <Pressable onPress={() => void openCustomerAction("tel")} style={({ pressed }) => [styles.quickActionButton, pressed ? styles.quickActionPressed : null]}>
          <View style={[styles.quickActionIcon, styles.quickActionIconTel]}>
            <Ionicons color={theme.colors.info} name="call-outline" size={20} />
          </View>
          <Text style={styles.quickActionTitle}>Telepon</Text>
          <Text style={styles.quickActionSubtitle}>Hubungi pelanggan</Text>
        </Pressable>
      </View>

      <AppPanel style={styles.panel}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Profil & Kontak</Text>
          <Pressable onPress={() => setExpanded((value) => !value)} style={styles.expandButton}>
            <Text style={styles.expandLabel}>{expanded ? "Ringkas" : "Lengkap"}</Text>
            <Ionicons color={theme.colors.textSecondary} name={expanded ? "chevron-up" : "chevron-down"} size={17} />
          </Pressable>
        </View>

        {profileRows.map((row) => (
          <View key={row.label} style={styles.infoRow}>
            <View style={styles.infoIconWrap}>
              <Ionicons color={theme.colors.textSecondary} name={row.iconName} size={16} />
            </View>
            <View style={styles.infoTextWrap}>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={[styles.infoValue, row.muted ? styles.infoValueMuted : null]}>{row.value}</Text>
            </View>
          </View>
        ))}

        {expanded
          ? extraRows.map((row) => (
              <View key={row.label} style={styles.infoRow}>
                <View style={styles.infoIconWrap}>
                  <Ionicons color={theme.colors.textSecondary} name={row.iconName} size={16} />
                </View>
                <View style={styles.infoTextWrap}>
                  <Text style={styles.infoLabel}>{row.label}</Text>
                  <Text style={[styles.infoValue, row.muted ? styles.infoValueMuted : null]}>{row.value}</Text>
                </View>
              </View>
            ))
          : null}
      </AppPanel>

      <AppPanel style={styles.panel}>
        <Text style={styles.sectionTitle}>Data Keuangan</Text>
        <View style={styles.financeRow}>
          <View style={styles.financeItem}>
            <Text style={styles.financeValue}>0</Text>
            <Text style={styles.financeLabel}>Deposit</Text>
          </View>
          <View style={styles.financeDivider} />
          <View style={styles.financeItem}>
            <Text style={styles.financeValue}>0</Text>
            <Text style={styles.financeLabel}>Kasbon</Text>
          </View>
          <View style={styles.financeDivider} />
          <View style={styles.financeItem}>
            <Text style={styles.financeValue}>0</Text>
            <Text style={styles.financeLabel}>Piutang</Text>
          </View>
        </View>
      </AppPanel>

      <AppPanel style={styles.panel}>
        <Text style={styles.sectionTitle}>Data Transaksi</Text>
        <View style={styles.placeholderRow}>
          <Ionicons color={theme.colors.textMuted} name="receipt-outline" size={16} />
          <Text style={styles.placeholderText}>Belum mempunyai transaksi</Text>
        </View>
      </AppPanel>

      <AppPanel style={styles.panel}>
        <Text style={styles.sectionTitle}>Data Paket</Text>
        <View style={styles.placeholderRow}>
          <Ionicons color={theme.colors.textMuted} name="cube-outline" size={16} />
          <Text style={styles.placeholderText}>Belum mempunyai paket</Text>
        </View>
      </AppPanel>

      {errorMessage ? (
        <View style={styles.errorWrap}>
          <Ionicons color={theme.colors.danger} name="warning-outline" size={16} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </AppScreen>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: isCompactLandscape ? theme.spacing.md : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.sm,
    },
    heroCard: {
      position: "relative",
      borderRadius: isTablet ? 28 : isCompactLandscape ? 20 : 24,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "rgba(91,174,255,0.35)" : "rgba(83,166,248,0.32)",
      minHeight: isTablet ? 186 : isCompactLandscape ? 152 : 172,
      backgroundColor: "#1368bc",
    },
    heroLayerPrimary: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#1368bc",
    },
    heroLayerSecondary: {
      position: "absolute",
      top: 0,
      right: -40,
      bottom: 0,
      width: "70%",
      backgroundColor: "#1fa3e8",
      opacity: 0.74,
    },
    heroGlow: {
      position: "absolute",
      right: -72,
      top: -84,
      width: 205,
      height: 205,
      borderRadius: 132,
      borderWidth: 28,
      borderColor: "rgba(255,255,255,0.12)",
    },
    heroContent: {
      paddingHorizontal: isCompactLandscape ? theme.spacing.md : theme.spacing.lg,
      paddingVertical: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      gap: isCompactLandscape ? 8 : theme.spacing.sm,
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    topIconButton: {
      width: isCompactLandscape ? 34 : 36,
      height: isCompactLandscape ? 34 : 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.32)",
      backgroundColor: "rgba(255,255,255,0.14)",
    },
    topIconGhost: {
      width: isCompactLandscape ? 34 : 36,
      height: isCompactLandscape ? 34 : 36,
    },
    heroBrandWrap: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      gap: 1,
    },
    brandText: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 24 : isCompactLandscape ? 20 : 22,
      lineHeight: isTablet ? 30 : isCompactLandscape ? 24 : 27,
      letterSpacing: 0.3,
    },
    heroSubtitle: {
      color: "rgba(233,247,255,0.9)",
      fontFamily: theme.fonts.semibold,
      fontSize: isCompactLandscape ? 10 : 11,
      textTransform: "uppercase",
      letterSpacing: 0.7,
    },
    customerName: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 34 : isCompactLandscape ? 24 : 29,
      lineHeight: isTablet ? 40 : isCompactLandscape ? 29 : 35,
    },
    heroMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    heroChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.3)",
      borderRadius: theme.radii.pill,
      backgroundColor: "rgba(255,255,255,0.14)",
      paddingHorizontal: 9,
      paddingVertical: 5,
      maxWidth: "100%",
    },
    heroChipText: {
      color: "#dff1ff",
      fontFamily: theme.fonts.semibold,
      fontSize: 10,
    },
    quickActionRow: {
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    quickActionButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: isCompactLandscape ? theme.radii.md : theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 11,
      paddingVertical: 10,
      gap: 4,
      shadowColor: theme.shadows.color,
      shadowOpacity: theme.mode === "dark" ? 0.18 : 0.08,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 1,
    },
    quickActionPressed: {
      opacity: 0.94,
      transform: [{ scale: 0.995 }],
    },
    quickActionIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    quickActionIconWa: {
      borderColor: theme.mode === "dark" ? "rgba(56,211,133,0.46)" : "rgba(31,158,99,0.3)",
      backgroundColor: theme.mode === "dark" ? "rgba(56,211,133,0.15)" : "rgba(31,158,99,0.1)",
    },
    quickActionIconTel: {
      borderColor: theme.mode === "dark" ? "rgba(112,177,255,0.46)" : "rgba(42,124,226,0.3)",
      backgroundColor: theme.mode === "dark" ? "rgba(112,177,255,0.17)" : "rgba(42,124,226,0.1)",
    },
    quickActionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
      lineHeight: 18,
    },
    quickActionSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 15,
    },
    panel: {
      gap: theme.spacing.xs,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.warning,
      fontFamily: theme.fonts.bold,
      fontSize: 17,
      lineHeight: 23,
    },
    expandButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    expandLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: 0.45,
    },
    infoRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    infoIconWrap: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
    },
    infoTextWrap: {
      flex: 1,
      gap: 1,
      minWidth: 0,
    },
    infoLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: 0.35,
    },
    infoValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 19,
    },
    infoValueMuted: {
      color: theme.colors.textMuted,
    },
    financeRow: {
      flexDirection: "row",
      alignItems: "stretch",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      overflow: "hidden",
    },
    financeItem: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
      paddingVertical: 10,
      gap: 2,
    },
    financeDivider: {
      width: 1,
      backgroundColor: theme.colors.border,
    },
    financeValue: {
      color: theme.colors.info,
      fontFamily: theme.fonts.heavy,
      fontSize: isCompactLandscape ? 22 : 25,
      lineHeight: isCompactLandscape ? 27 : 30,
    },
    financeLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    placeholderRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    placeholderText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 18,
    },
    errorWrap: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 7,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#6c3242" : "#f0bbc5",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#482633" : "#fff1f4",
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    errorText: {
      flex: 1,
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
  });
}
