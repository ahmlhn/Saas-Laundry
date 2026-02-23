import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { getTenantProfile, updateTenantProfile } from "../../features/tenant/tenantApi";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { TenantProfile } from "../../types/tenant";

export function TenantManagementScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "TenantManagement">>();
  const { session } = useSession();
  const roles = session?.roles ?? [];
  const canView = hasAnyRole(roles, ["owner", "tenant_manager"]);
  const canEditStatus = hasAnyRole(roles, ["owner"]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenant, setTenant] = useState<TenantProfile | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    void bootstrap();
  }, [canView]);

  async function bootstrap(): Promise<void> {
    setLoading(true);
    setErrorMessage(null);

    try {
      const data = await getTenantProfile();
      setTenant(data);
      setTenantName(data.name);
      setStatus(data.status === "inactive" ? "inactive" : "active");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(): Promise<void> {
    if (!tenant || saving) {
      return;
    }

    const normalizedName = tenantName.trim();
    if (!normalizedName) {
      setErrorMessage("Nama tenant wajib diisi.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload = canEditStatus
        ? {
            name: normalizedName,
            status,
          }
        : {
            name: normalizedName,
          };

      const updated = await updateTenantProfile(payload);
      setTenant(updated);
      setTenantName(updated.name);
      setStatus(updated.status === "inactive" ? "inactive" : "active");
      setSuccessMessage("Profil tenant berhasil diperbarui.");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <AppScreen contentContainerStyle={styles.content} scroll>
        <AppPanel style={styles.heroPanel}>
          <View style={styles.heroTopRow}>
            <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
              <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
            </Pressable>
            <View style={styles.heroBadge}>
              <Ionicons color={theme.colors.info} name="business-outline" size={15} />
              <Text style={styles.heroBadgeText}>Tenant</Text>
            </View>
            <View style={styles.heroSpacer} />
          </View>
          <Text style={styles.title}>Kelola Tenant</Text>
          <Text style={styles.subtitle}>Akun Anda tidak memiliki akses ke modul ini.</Text>
        </AppPanel>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <AppPanel style={styles.heroPanel}>
        <View style={styles.heroTopRow}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
          </Pressable>
          <View style={styles.heroBadge}>
            <Ionicons color={theme.colors.info} name="business-outline" size={15} />
            <Text style={styles.heroBadgeText}>Tenant</Text>
          </View>
          <Pressable onPress={() => void bootstrap()} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="refresh-outline" size={18} />
          </Pressable>
        </View>
        <Text style={styles.title}>Kelola Tenant</Text>
        <Text style={styles.subtitle}>Atur identitas tenant dan pantau ringkasan data utama operasional.</Text>
      </AppPanel>

      {loading ? (
        <AppPanel style={styles.formPanel}>
          <Text style={styles.infoText}>Memuat profil tenant...</Text>
        </AppPanel>
      ) : tenant ? (
        <>
          <AppPanel style={styles.formPanel}>
            <Text style={styles.label}>Nama Tenant</Text>
            <TextInput
              maxLength={120}
              onChangeText={setTenantName}
              placeholder="Nama tenant"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={tenantName}
            />

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>ID Tenant</Text>
              <Text numberOfLines={1} style={styles.infoValue}>
                {tenant.id}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status</Text>
              <StatusPill label={status === "active" ? "Aktif" : "Nonaktif"} tone={status === "active" ? "success" : "warning"} />
            </View>

            {canEditStatus ? (
              <View style={styles.statusRow}>
                <Pressable onPress={() => setStatus("active")} style={[styles.statusChip, status === "active" ? styles.statusChipActive : null]}>
                  <Text style={[styles.statusChipText, status === "active" ? styles.statusChipTextActive : null]}>Aktif</Text>
                </Pressable>
                <Pressable onPress={() => setStatus("inactive")} style={[styles.statusChip, status === "inactive" ? styles.statusChipActive : null]}>
                  <Text style={[styles.statusChipText, status === "inactive" ? styles.statusChipTextActive : null]}>Nonaktif</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.helperText}>Perubahan status tenant hanya dapat dilakukan oleh owner.</Text>
            )}

            <AppButton
              disabled={saving}
              leftElement={<Ionicons color={theme.colors.primaryContrast} name="save-outline" size={17} />}
              loading={saving}
              onPress={() => void handleSave()}
              title="Simpan Perubahan"
            />
          </AppPanel>

          <AppPanel style={styles.statsPanel}>
            <Text style={styles.statsTitle}>Ringkasan Tenant</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{tenant.stats.outlets_total}</Text>
                <Text style={styles.statLabel}>Outlet</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{tenant.stats.users_total}</Text>
                <Text style={styles.statLabel}>User</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{tenant.stats.users_active}</Text>
                <Text style={styles.statLabel}>User Aktif</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{tenant.stats.services_total}</Text>
                <Text style={styles.statLabel}>Layanan</Text>
              </View>
            </View>
            <Text style={styles.planText}>
              Plan: {tenant.plan.name ?? "-"} ({tenant.plan.key ?? "-"}){tenant.plan.orders_limit !== null ? ` • Limit ${tenant.plan.orders_limit}` : ""}
            </Text>
          </AppPanel>
        </>
      ) : (
        <AppPanel style={styles.formPanel}>
          <Text style={styles.infoText}>Profil tenant tidak ditemukan.</Text>
        </AppPanel>
      )}

      {successMessage ? (
        <View style={styles.successWrap}>
          <Ionicons color={theme.colors.success} name="checkmark-circle-outline" size={16} />
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      ) : null}
      {errorMessage ? (
        <View style={styles.errorWrap}>
          <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
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
      paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: isCompactLandscape ? theme.spacing.xs : theme.spacing.sm,
    },
    heroPanel: {
      gap: theme.spacing.xs,
      backgroundColor: theme.mode === "dark" ? "#122d46" : "#f2faff",
      borderColor: theme.colors.borderStrong,
    },
    heroTopRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    heroIconButton: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    heroIconButtonPressed: {
      opacity: 0.82,
    },
    heroBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.92)",
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    heroBadgeText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 11,
      letterSpacing: 0.2,
      textTransform: "uppercase",
    },
    heroSpacer: {
      width: 36,
      height: 36,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 27 : 24,
      lineHeight: isTablet ? 33 : 30,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      lineHeight: 18,
    },
    formPanel: {
      gap: theme.spacing.xs,
    },
    label: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: isTablet ? 14 : 13,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    infoRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    infoLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
    },
    infoValue: {
      flex: 1,
      textAlign: "right",
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
    },
    infoText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      textAlign: "center",
      paddingVertical: 8,
    },
    statusRow: {
      flexDirection: "row",
      gap: 8,
    },
    statusChip: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 8,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
    },
    statusChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    statusChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    statusChipTextActive: {
      color: theme.colors.info,
    },
    helperText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 17,
    },
    statsPanel: {
      gap: theme.spacing.xs,
      borderColor: theme.colors.borderStrong,
    },
    statsTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 14,
    },
    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    statItem: {
      width: "48%",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
      paddingVertical: 9,
      gap: 1,
    },
    statValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 16,
    },
    statLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
    },
    planText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    successWrap: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#1d5b3f" : "#bde7cd",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#173f2d" : "#edf9f1",
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    successText: {
      flex: 1,
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
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    errorText: {
      flex: 1,
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
