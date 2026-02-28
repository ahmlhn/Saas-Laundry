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
import type { ServiceDisplayUnit } from "../../types/service";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

type ParfumItemFormRoute = RouteProp<AccountStackParamList, "ParfumItemForm">;

function normalizeDigits(value: string): string {
  return value.replace(/[^\d]/g, "");
}

function resolveTypeLabel(serviceType: "perfume" | "item"): string {
  return serviceType === "perfume" ? "Parfum" : "Item";
}

function resolveUnitTypeFromDisplayUnit(displayUnit: ServiceDisplayUnit): "kg" | "pcs" | "meter" {
  if (displayUnit === "kg") {
    return "kg";
  }

  if (displayUnit === "meter") {
    return "meter";
  }

  return "pcs";
}

export function ParfumItemFormScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "ParfumItemForm">>();
  const route = useRoute<ParfumItemFormRoute>();
  const { session } = useSession();

  const roles = session?.roles ?? [];
  const canManage = hasAnyRole(roles, ["owner", "admin"]);
  const mode = route.params.mode;
  const isEdit = mode === "edit";
  const serviceType = route.params.serviceType;
  const item = route.params.item;
  const defaultDurationDays = getDefaultDurationDays(serviceType);
  const defaultDuration = resolveDurationValueAndUnit(item?.duration_days, item?.duration_hours, serviceType);

  const [nameInput, setNameInput] = useState(item?.name ?? "");
  const [basePriceInput, setBasePriceInput] = useState(item ? String(item.base_price_amount) : "");
  const [durationInput, setDurationInput] = useState(String(defaultDuration.value));
  const [durationUnit, setDurationUnit] = useState<ServiceDurationUnit>(defaultDuration.unit ?? getDefaultDurationUnit(serviceType));
  const [displayUnit, setDisplayUnit] = useState<ServiceDisplayUnit>(
    item?.display_unit === "kg" || item?.display_unit === "pcs" || item?.display_unit === "meter"
      ? item.display_unit
      : item?.unit_type === "kg"
        ? "kg"
        : item?.unit_type === "meter"
          ? "meter"
          : "pcs"
  );
  const [active, setActive] = useState(item?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const defaultDurationLabel = formatServiceDuration(defaultDuration.unit === "day" ? defaultDuration.value : 0, defaultDuration.unit === "hour" ? defaultDuration.value : 0);

  async function handleSave(): Promise<void> {
    if (!canManage || saving) {
      return;
    }

    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setErrorMessage("Nama wajib diisi.");
      return;
    }

    const parsedPrice = Number.parseInt(basePriceInput, 10);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setErrorMessage("Harga tidak valid.");
      return;
    }

    const parsedDurationValue = durationInput.trim() === "" ? null : Number.parseInt(durationInput, 10);
    if (parsedDurationValue === null || !Number.isFinite(parsedDurationValue) || parsedDurationValue <= 0) {
      setErrorMessage("Durasi layanan tidak valid.");
      return;
    }
    if (durationUnit === "hour" && parsedDurationValue > 23) {
      setErrorMessage("Durasi jam maksimal 23 jam.");
      return;
    }
    const resolvedDuration = resolveDurationPartsFromValue(parsedDurationValue, durationUnit);

    setSaving(true);
    setErrorMessage(null);

    try {
      const unitType = resolveUnitTypeFromDisplayUnit(displayUnit);

      if (isEdit && item) {
        await updateService(item.id, {
          name: trimmedName,
          serviceType,
          parentServiceId: null,
          isGroup: false,
          unitType,
          displayUnit,
          basePriceAmount: parsedPrice,
          durationDays: resolvedDuration.durationDays,
          durationHours: resolvedDuration.durationHours,
          active,
        });
      } else {
        await createService({
          name: trimmedName,
          serviceType,
          parentServiceId: null,
          isGroup: false,
          unitType,
          displayUnit,
          basePriceAmount: parsedPrice,
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
        <ServiceModuleHeader onBack={() => navigation.goBack()} title={isEdit ? "Edit Data" : "Tambah Data"}>
          <View style={styles.headerMetaRow}>
            <StatusPill label={resolveTypeLabel(serviceType)} tone={serviceType === "perfume" ? "info" : "warning"} />
            <StatusPill label={active ? "Aktif" : "Nonaktif"} tone={active ? "success" : "warning"} />
          </View>
        </ServiceModuleHeader>

        <AppPanel style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelEyebrow}>Identitas</Text>
            <Text style={styles.panelTitle}>Data inti</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Nama</Text>
            <TextInput
              editable={!saving && canManage}
              onChangeText={setNameInput}
              placeholder={serviceType === "perfume" ? "Contoh: Parfum Mawar" : "Contoh: Kemeja Panjang"}
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={nameInput}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Satuan Hitung</Text>
            <View style={styles.segmentRow}>
              {(["kg", "pcs", "meter"] as const).map((unit) => {
                const selected = displayUnit === unit;
                return (
                  <Pressable key={unit} onPress={() => setDisplayUnit(unit)} style={[styles.segmentChip, selected ? styles.segmentChipActive : null]}>
                    <Text style={[styles.segmentText, selected ? styles.segmentTextActive : null]}>{unit.toUpperCase()}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </AppPanel>

        <AppPanel style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelEyebrow}>Harga & Durasi</Text>
            <Text style={styles.panelTitle}>Nilai data</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Harga</Text>
            <TextInput
              editable={!saving && canManage}
              keyboardType="number-pad"
              onChangeText={(text) => setBasePriceInput(normalizeDigits(text))}
              placeholder="Contoh: 5000"
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
                  editable={!saving && canManage}
                  keyboardType="number-pad"
                  onChangeText={(text) => setDurationInput(normalizeDigits(text))}
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
                ] as const).map((option) => {
                  const selected = durationUnit === option.value;
                  return (
                    <Pressable key={option.value} onPress={() => setDurationUnit(option.value)} style={[styles.segmentChip, selected ? styles.segmentChipActive : null]}>
                      <Text style={[styles.segmentText, selected ? styles.segmentTextActive : null]}>{option.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Text style={styles.fieldHint}>
              Default otomatis {defaultDurationLabel} dan tetap bisa disesuaikan oleh admin.
            </Text>
          </View>
        </AppPanel>

        <AppPanel style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelEyebrow}>Status</Text>
            <Text style={styles.panelTitle}>Ketersediaan data</Text>
          </View>

          <View style={styles.statusRow}>
            <View style={styles.statusCopy}>
              <Text style={styles.label}>Status</Text>
              <Text style={styles.fieldHint}>Data nonaktif tetap tersimpan, tetapi tidak muncul sebagai pilihan utama di transaksi.</Text>
            </View>
            <Pressable onPress={() => setActive((value) => !value)} style={[styles.statusChip, active ? styles.statusChipActive : null]}>
              <Text style={[styles.statusText, active ? styles.statusTextActive : null]}>{active ? "Aktif" : "Nonaktif"}</Text>
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
          <Text style={styles.saveHint}>Pastikan nama, harga, dan satuan hitung sudah benar sebelum menyimpan.</Text>
          <AppButton disabled={!canManage || saving} loading={saving} onPress={() => void handleSave()} title={isEdit ? "Simpan Data" : "Tambah Data"} />
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
    fieldHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
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
      gap: 8,
    },
    durationField: {
      flex: 1,
      gap: 6,
    },
    durationUnitRow: {
      flex: 1,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    segmentRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    segmentChip: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minWidth: 82,
      alignItems: "center",
    },
    segmentChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    segmentText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    segmentTextActive: {
      color: theme.colors.info,
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
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: theme.colors.surfaceSoft,
      minWidth: 98,
      alignItems: "center",
    },
    statusChipActive: {
      borderColor: theme.colors.success,
      backgroundColor: theme.mode === "dark" ? "rgba(56,211,133,0.2)" : "rgba(56,211,133,0.16)",
    },
    statusText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    statusTextActive: {
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
