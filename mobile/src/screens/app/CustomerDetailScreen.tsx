import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppPanel } from "../../components/ui/AppPanel";
import { parseCustomerProfileMeta } from "../../features/customers/customerProfileNote";
import { extractCustomerPhoneDigits, formatCustomerPhoneDisplay } from "../../features/customers/customerPhone";
import { hasAnyRole } from "../../lib/accessControl";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

type CustomerDetailRoute = RouteProp<AccountStackParamList, "CustomerDetail">;
type CustomerDetailNavigation = NativeStackNavigationProp<AccountStackParamList, "CustomerDetail">;

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
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

interface InfoRowProps {
  iconName: keyof typeof Ionicons.glyphMap;
  value: string;
  muted?: boolean;
}

function InfoRow({ iconName, value, muted = false }: InfoRowProps) {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.infoRow}>
      <Ionicons color={theme.colors.textSecondary} name={iconName} size={18} />
      <Text style={[styles.infoText, muted ? styles.infoTextMuted : null]}>{value}</Text>
    </View>
  );
}

export function CustomerDetailScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width, height } = useWindowDimensions();
  const route = useRoute<CustomerDetailRoute>();
  const navigation = useNavigation<CustomerDetailNavigation>();
  const { session } = useSession();

  const customer = route.params.customer;
  const roles = session?.roles ?? [];
  const canCreateOrEdit = hasAnyRole(roles, ["owner", "admin", "cashier"]);
  const meta = useMemo(() => parseCustomerProfileMeta(customer.notes), [customer.notes]);
  const [expanded, setExpanded] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const minEdge = Math.min(width, height);
  const isTablet = minEdge >= 600;
  const compactName = customer.name.trim().length > 22 || width < 380;
  const veryCompactName = customer.name.trim().length > 34 || width < 340;

  async function openCustomerAction(action: "wa" | "tel"): Promise<void> {
    const normalizedPhone = extractCustomerPhoneDigits(customer.phone_normalized);
    if (!normalizedPhone) {
      setErrorMessage("Nomor telepon pelanggan belum tersedia.");
      setActionMessage(null);
      return;
    }

    const targetUrl = action === "wa" ? `https://wa.me/${normalizedPhone}` : `tel:+${normalizedPhone}`;
    const successLabel = action === "wa" ? "Membuka WhatsApp..." : "Membuka aplikasi telepon...";

    try {
      const supported = await Linking.canOpenURL(targetUrl);
      if (!supported) {
        setErrorMessage(action === "wa" ? "WhatsApp tidak tersedia di perangkat ini." : "Aplikasi telepon tidak tersedia di perangkat ini.");
        setActionMessage(null);
        return;
      }

      await Linking.openURL(targetUrl);
      setActionMessage(successLabel);
      setErrorMessage(null);
    } catch {
      setErrorMessage("Gagal menjalankan aksi pelanggan.");
      setActionMessage(null);
    }
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <View style={styles.headerWrap}>
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} style={styles.topIconButton}>
            <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={22} />
          </Pressable>
          <Text style={styles.brandText}>Cuci Laundry</Text>
          <View style={styles.topIconGhost} />
        </View>
      </View>

      <AppPanel style={styles.customerNamePanel}>
        <View style={styles.customerTitleRow}>
          <View style={styles.customerTitleWrap}>
            <Text numberOfLines={3} style={[styles.customerName, compactName ? styles.customerNameCompact : null, veryCompactName ? styles.customerNameVeryCompact : null, isTablet ? styles.customerNameTablet : null]}>
              {customer.name}
            </Text>
            <Text style={styles.customerRegistered}>Terdaftar sejak {formatRegisteredDate(customer.created_at)}</Text>
          </View>
          {canCreateOrEdit ? (
            <Pressable
              onPress={() =>
                navigation.navigate("CustomerForm", {
                  mode: "edit",
                  customer,
                })
              }
              style={styles.editButton}
            >
              <Ionicons color={theme.colors.info} name="create-outline" size={20} />
            </Pressable>
          ) : null}
        </View>
      </AppPanel>

      <AppPanel style={styles.panel}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>Profil & Kontak</Text>
          <View style={styles.actionButtonsRow}>
            <Pressable onPress={() => void openCustomerAction("wa")} style={styles.actionButton}>
              <Ionicons color={theme.colors.success} name="logo-whatsapp" size={20} />
            </Pressable>
            <Pressable onPress={() => void openCustomerAction("tel")} style={styles.actionButton}>
              <Ionicons color={theme.colors.info} name="call-outline" size={20} />
            </Pressable>
          </View>
        </View>

        <InfoRow
          iconName="phone-portrait-outline"
          value={formatCustomerPhoneDisplay(customer.phone_normalized)}
          muted={!extractCustomerPhoneDigits(customer.phone_normalized)}
        />
        <InfoRow iconName="location-outline" value={meta.address || "Tidak ada alamat"} muted={!meta.address} />
        {expanded ? (
          <>
            <InfoRow iconName="mail-outline" value={meta.email || "Tidak ada email"} muted={!meta.email} />
            <InfoRow iconName="calendar-outline" value={meta.birthDate || "Tanggal lahir tidak diketahui"} muted={!meta.birthDate} />
            <InfoRow iconName="transgender-outline" value={mapGender(meta.gender)} muted={!meta.gender} />
            {meta.note ? <InfoRow iconName="document-text-outline" value={meta.note} /> : null}
          </>
        ) : null}

        <Pressable onPress={() => setExpanded((value) => !value)} style={styles.expandButton}>
          <Ionicons color={theme.colors.textSecondary} name={expanded ? "chevron-up" : "chevron-down"} size={22} />
        </Pressable>
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
        <Text style={styles.emptyText}>Belum mempunyai transaksi</Text>
      </AppPanel>

      <AppPanel style={styles.panel}>
        <Text style={styles.sectionTitle}>Data Paket</Text>
        <Text style={styles.emptyText}>Belum mempunyai paket</Text>
      </AppPanel>

      {actionMessage ? (
        <View style={styles.successWrap}>
          <Text style={styles.successText}>{actionMessage}</Text>
        </View>
      ) : null}
      {errorMessage ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </AppScreen>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.sm,
    },
    headerWrap: {
      gap: theme.spacing.sm,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    topIconButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    topIconGhost: {
      width: 38,
      height: 38,
    },
    brandText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.heavy,
      fontSize: 23,
      letterSpacing: 0.3,
    },
    customerNamePanel: {
      paddingVertical: 14,
    },
    customerTitleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    customerTitleWrap: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    customerName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 31,
      lineHeight: 37,
    },
    customerNameCompact: {
      fontSize: 27,
      lineHeight: 33,
    },
    customerNameVeryCompact: {
      fontSize: 23,
      lineHeight: 29,
    },
    customerNameTablet: {
      fontSize: 35,
      lineHeight: 42,
    },
    customerRegistered: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    editButton: {
      marginTop: 2,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.primarySoft,
      borderWidth: 1,
      borderColor: theme.colors.ring,
    },
    panel: {
      gap: theme.spacing.xs,
    },
    sectionTitleRow: {
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
    actionButtonsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    actionButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surfaceSoft,
    },
    infoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    infoText: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
      lineHeight: 21,
    },
    infoTextMuted: {
      color: theme.colors.textMuted,
    },
    expandButton: {
      marginTop: 2,
      alignSelf: "center",
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surfaceSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    financeRow: {
      flexDirection: "row",
      alignItems: "stretch",
      justifyContent: "space-between",
      gap: 8,
    },
    financeItem: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 2,
      paddingVertical: 6,
    },
    financeDivider: {
      width: 1,
      backgroundColor: theme.colors.border,
    },
    financeValue: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 38,
      lineHeight: 43,
    },
    financeLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
    },
    emptyText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 15,
      lineHeight: 22,
    },
    successWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#1d5b3f" : "#bde7cd",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#173f2d" : "#edf9f1",
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    successText: {
      color: theme.colors.success,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    errorWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#6c3242" : "#f0bbc5",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#482633" : "#fff1f4",
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    errorText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
