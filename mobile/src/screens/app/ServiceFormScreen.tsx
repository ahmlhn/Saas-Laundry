import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { ServiceModuleHeader } from "../../components/services/ServiceModuleHeader";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { createService, updateService } from "../../features/services/serviceApi";
import {
  formatServiceDuration,
  getDefaultDurationDays,
  getDefaultDurationUnit,
  resolveDurationPartsFromValue,
  resolveDurationValueAndUnit,
  type ServiceDurationUnit,
} from "../../features/services/defaultDuration";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

type ServiceFormRoute = RouteProp<AccountStackParamList, "ServiceForm">;

const currencyFormatter = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(value)}`;
}

function normalizePriceInput(input: string): string {
  return input.replace(/\D+/g, "");
}

function normalizeDigitInput(input: string): string {
  return input.replace(/[^\d]/g, "");
}

function resolveServiceTypeLabel(serviceType: string): string {
  if (serviceType === "package") {
    return "Paket";
  }
  if (serviceType === "perfume") {
    return "Parfum";
  }
  if (serviceType === "item") {
    return "Item";
  }

  return "Reguler";
}

export function ServiceFormScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "ServiceForm">>();
  const route = useRoute<ServiceFormRoute>();
  const { session } = useSession();

  const roles = session?.roles ?? [];
  const canManage = hasAnyRole(roles, ["owner", "admin"]);
  const editingService = route.params.mode === "edit" ? route.params.service ?? null : null;
  const isEditMode = route.params.mode === "edit";
  const serviceType = typeof editingService?.service_type === "string" ? editingService.service_type : "regular";
  const defaultDurationDays = getDefaultDurationDays(serviceType);
  const defaultDuration = resolveDurationValueAndUnit(editingService?.duration_days, editingService?.duration_hours, serviceType);

  const [name, setName] = useState(editingService?.name ?? "");
  const [unitType, setUnitType] = useState<"kg" | "pcs" | "meter">(
    editingService?.unit_type === "pcs" || editingService?.unit_type === "meter" ? editingService.unit_type : "kg"
  );
  const [basePriceInput, setBasePriceInput] = useState(editingService ? String(editingService.base_price_amount) : "");
  const [durationInput, setDurationInput] = useState(String(defaultDuration.value));
  const [durationUnit, setDurationUnit] = useState<ServiceDurationUnit>(defaultDuration.unit ?? getDefaultDurationUnit(serviceType));
  const [active, setActive] = useState(editingService?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsedBasePrice = Number.parseInt(normalizePriceInput(basePriceInput), 10);
  const basePriceAmount = Number.isFinite(parsedBasePrice) ? parsedBasePrice : 0;
  const defaultDurationLabel = formatServiceDuration(defaultDuration.unit === "day" ? defaultDuration.value : 0, defaultDuration.unit === "hour" ? defaultDuration.value : 0);

  async function handleSave(): Promise<void> {
    if (!canManage || saving) {
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage("Nama layanan wajib diisi.");
      return;
    }

    if (!Number.isFinite(basePriceAmount) || basePriceAmount < 0) {
      setErrorMessage("Harga dasar tidak valid.");
      return;
    }

    const parsedDurationValue = durationInput.trim() === "" ? null : Number.parseInt(normalizeDigitInput(durationInput), 10);
    if (parsedDurationValue === null || !Number.isFinite(parsedDurationValue) || parsedDurationValue <= 0) {
      setErrorMessage("Durasi layanan tidak valid.");
      return;
    }
    if (durationUnit === "hour" && parsedDurationValue > 23) {
      setErrorMessage("Durasi jam maksimal 23 jam.");
      return;
    }
    const resolvedDuration = resolveDurationPartsFromValue(parsedDurationValue, durationUnit);

    if (isEditMode && !editingService) {
      setErrorMessage("Data layanan tidak ditemukan untuk mode edit.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      if (isEditMode && editingService) {
        await updateService(editingService.id, {
          name: trimmedName,
          unitType,
          basePriceAmount,
          durationDays: resolvedDuration.durationDays,
          durationHours: resolvedDuration.durationHours,
          active,
        });
      } else {
        await createService({
          name: trimmedName,
          unitType,
          basePriceAmount,
          durationDays: resolvedDuration.durationDays,
          durationHours: resolvedDuration.durationHours,
          active,
        });
      }

      navigation.goBack();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <AppScreen contentContainerStyle={styles.content} scroll>
        <ServiceModuleHeader onBack={() => navigation.goBack()} title={isEditMode ? "Edit Layanan" : "Tambah Layanan"}>
          <View style={styles.headerMetaRow}>
            <StatusPill label={resolveServiceTypeLabel(serviceType)} tone={serviceType === "package" ? "success" : "info"} />
            <StatusPill label={active ? "Aktif" : "Nonaktif"} tone={active ? "success" : "warning"} />
          </View>
        </ServiceModuleHeader>

        <AppPanel style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelEyebrow}>Informasi Inti</Text>
            <Text style={styles.panelTitle}>Identitas layanan</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Nama Layanan/Produk</Text>
            <TextInput
              onChangeText={setName}
              placeholder="Contoh: Kiloan Reguler"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={name}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Unit</Text>
            <View style={styles.segmentRow}>
              {(["kg", "pcs", "meter"] as const).map((unit) => (
                <Pressable key={unit} onPress={() => setUnitType(unit)} style={[styles.segmentChip, unitType === unit ? styles.segmentChipActive : null]}>
                  <Text style={[styles.segmentChipText, unitType === unit ? styles.segmentChipTextActive : null]}>{unit.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </AppPanel>

        <AppPanel style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelEyebrow}>Harga & SLA</Text>
            <Text style={styles.panelTitle}>Nilai layanan</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Harga Dasar</Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={(text) => setBasePriceInput(normalizePriceInput(text))}
              placeholder="Contoh: 12000"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={basePriceInput}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Durasi Layanan</Text>
            <View style={styles.durationRow}>
              <View style={styles.durationField}>
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={(text) => setDurationInput(normalizeDigitInput(text))}
                  placeholder={`Contoh: ${defaultDuration.value}`}
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.input}
                  value={durationInput}
                />
              </View>
              <View style={styles.durationUnitRow}>
                {([
                  { label: "Hari", value: "day" },
                  { label: "Jam", value: "hour" },
                ] as const).map((option) => (
                  <Pressable
                    key={option.value}
                    onPress={() => setDurationUnit(option.value)}
                    style={[styles.segmentChip, durationUnit === option.value ? styles.segmentChipActive : null]}
                  >
                    <Text style={[styles.segmentChipText, durationUnit === option.value ? styles.segmentChipTextActive : null]}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Text style={styles.fieldHint}>
              Default otomatis {defaultDurationLabel} dan tetap bisa diubah sesuai kebutuhan outlet.
            </Text>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Preview Harga</Text>
              <Text style={styles.statValue}>{formatMoney(basePriceAmount)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Durasi Aktif</Text>
              <Text style={styles.statValue}>
                {formatServiceDuration(
                  durationUnit === "day" ? (durationInput.trim() === "" ? defaultDuration.value : Number.parseInt(durationInput, 10)) : 0,
                  durationUnit === "hour" ? (durationInput.trim() === "" ? defaultDuration.value : Number.parseInt(durationInput, 10)) : 0,
                  "Belum diatur"
                )}
              </Text>
            </View>
          </View>
        </AppPanel>

        <AppPanel style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelEyebrow}>Status</Text>
            <Text style={styles.panelTitle}>Ketersediaan layanan</Text>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.statusCopy}>
              <Text style={styles.label}>Status Layanan</Text>
              <Text style={styles.fieldHint}>Layanan nonaktif tetap tersimpan, tetapi tidak diprioritaskan saat membuat pesanan.</Text>
            </View>
            <Pressable onPress={() => setActive((value) => !value)} style={[styles.statusChip, active ? styles.statusChipActive : null]}>
              <Text style={[styles.statusChipText, active ? styles.statusChipTextActive : null]}>{active ? "Aktif" : "Nonaktif"}</Text>
            </Pressable>
          </View>
        </AppPanel>

        {errorMessage ? (
          <View style={styles.errorWrap}>
            <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <AppPanel style={styles.savePanel}>
          <Text style={styles.saveHint}>Pastikan nama layanan unik dan harga dasar sudah benar sebelum menyimpan.</Text>
          <AppButton
            disabled={saving || !canManage}
            loading={saving}
            onPress={() => void handleSave()}
            title={isEditMode ? "Simpan Perubahan" : "Simpan Layanan"}
          />
        </AppPanel>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.sm,
    },
    headerMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    heroShell: {
      position: "relative",
      overflow: "hidden",
      borderRadius: isTablet ? 30 : 26,
      borderWidth: 1,
      borderColor: "rgba(120, 212, 236, 0.34)",
      backgroundColor: "#0d66bf",
      minHeight: isTablet ? 232 : 220,
    },
    heroLayerPrimary: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "#0d66bf",
    },
    heroLayerSecondary: {
      position: "absolute",
      top: 0,
      right: -36,
      bottom: 0,
      width: "68%",
      backgroundColor: "#19b6dc",
      opacity: 0.62,
    },
    heroGlowLarge: {
      position: "absolute",
      top: -96,
      right: -86,
      width: 248,
      height: 248,
      borderRadius: 140,
      borderWidth: 36,
      borderColor: "rgba(255,255,255,0.1)",
    },
    heroGlowSmall: {
      position: "absolute",
      left: -72,
      bottom: -124,
      width: 208,
      height: 208,
      borderRadius: 120,
      backgroundColor: "rgba(255,255,255,0.1)",
    },
    heroContent: {
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: isCompactLandscape ? theme.spacing.md : theme.spacing.lg,
      gap: theme.spacing.xs,
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    heroIconButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.25)",
      backgroundColor: "rgba(255,255,255,0.12)",
      alignItems: "center",
      justifyContent: "center",
    },
    heroIconButtonPressed: {
      opacity: 0.82,
    },
    heroCenterWrap: {
      flex: 1,
      alignItems: "center",
      gap: 6,
    },
    heroSpacer: {
      width: 40,
      height: 40,
    },
    heroTitle: {
      color: "#ffffff",
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 28 : 23,
      lineHeight: isTablet ? 34 : 28,
      textAlign: "center",
    },
    heroMetaRow: {
      marginTop: 6,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: theme.spacing.xs,
    },
    heroHint: {
      color: "rgba(231,246,255,0.9)",
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      lineHeight: 18,
      textAlign: "center",
    },
    panel: {
      gap: theme.spacing.sm,
      borderRadius: theme.radii.xl,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
    },
    panelHeader: {
      gap: 2,
    },
    panelEyebrow: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 10,
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    panelTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 17,
      lineHeight: 22,
    },
    fieldGroup: {
      gap: 7,
    },
    label: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    durationRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.sm,
    },
    durationField: {
      flex: 1,
      gap: 6,
    },
    durationUnitRow: {
      flexDirection: "row",
      gap: theme.spacing.xs,
      alignItems: "stretch",
      flex: 1,
    },
    segmentRow: {
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    segmentChip: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 12,
    },
    segmentChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    segmentChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      letterSpacing: 0.2,
      textTransform: "uppercase",
    },
    segmentChipTextActive: {
      color: theme.colors.info,
    },
    fieldHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    statsRow: {
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    statCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 4,
    },
    statLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
    },
    statValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
      lineHeight: 20,
    },
    statusRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    statusCopy: {
      flex: 1,
      gap: 3,
    },
    statusChip: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 14,
      paddingVertical: 10,
      minWidth: 98,
      alignItems: "center",
    },
    statusChipActive: {
      borderColor: theme.colors.success,
      backgroundColor: theme.mode === "dark" ? "rgba(56,211,133,0.2)" : "rgba(56,211,133,0.15)",
    },
    statusChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    statusChipTextActive: {
      color: theme.colors.success,
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
    savePanel: {
      gap: theme.spacing.xs,
      borderRadius: theme.radii.xl,
      borderColor: theme.colors.borderStrong,
    },
    saveHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
