import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { createService, updateService } from "../../features/services/serviceApi";
import { getDefaultDurationDays } from "../../features/services/defaultDuration";
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

  const [name, setName] = useState(editingService?.name ?? "");
  const [unitType, setUnitType] = useState<"kg" | "pcs">(editingService?.unit_type === "pcs" ? "pcs" : "kg");
  const [basePriceInput, setBasePriceInput] = useState(editingService ? String(editingService.base_price_amount) : "");
  const [durationInput, setDurationInput] = useState(editingService?.duration_days ? String(editingService.duration_days) : String(defaultDurationDays));
  const [active, setActive] = useState(editingService?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsedBasePrice = Number.parseInt(normalizePriceInput(basePriceInput), 10);
  const basePriceAmount = Number.isFinite(parsedBasePrice) ? parsedBasePrice : 0;

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

    const parsedDuration = durationInput.trim() === "" ? null : Number.parseInt(normalizeDigitInput(durationInput), 10);
    if (parsedDuration !== null && (!Number.isFinite(parsedDuration) || parsedDuration <= 0)) {
      setErrorMessage("Durasi layanan tidak valid.");
      return;
    }

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
          durationDays: parsedDuration,
          active,
        });
      } else {
        await createService({
          name: trimmedName,
          unitType,
          basePriceAmount,
          durationDays: parsedDuration,
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
        <AppPanel style={styles.headerPanel}>
          <View style={styles.headerTopRow}>
            <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}>
              <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
            </Pressable>
            <View style={styles.headerBadge}>
              <Ionicons color={theme.colors.info} name={isEditMode ? "create-outline" : "add-circle-outline"} size={14} />
              <Text style={styles.headerBadgeText}>{isEditMode ? "Edit Layanan" : "Tambah Layanan"}</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>
          <Text style={styles.title}>{isEditMode ? "Perbarui layanan" : "Tambah layanan baru"}</Text>
          <Text style={styles.subtitle}>Atur nama, unit, harga dasar, dan status aktif layanan untuk katalog outlet.</Text>
        </AppPanel>

        <AppPanel style={styles.formPanel}>
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
              <Pressable onPress={() => setUnitType("kg")} style={[styles.segmentChip, unitType === "kg" ? styles.segmentChipActive : null]}>
                <Text style={[styles.segmentChipText, unitType === "kg" ? styles.segmentChipTextActive : null]}>Kg</Text>
              </Pressable>
              <Pressable onPress={() => setUnitType("pcs")} style={[styles.segmentChip, unitType === "pcs" ? styles.segmentChipActive : null]}>
                <Text style={[styles.segmentChipText, unitType === "pcs" ? styles.segmentChipTextActive : null]}>Pcs</Text>
              </Pressable>
            </View>
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
            <Text style={styles.pricePreview}>Preview: {formatMoney(basePriceAmount)}</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Durasi (hari)</Text>
            <TextInput
              keyboardType="number-pad"
              onChangeText={(text) => setDurationInput(normalizeDigitInput(text))}
              placeholder={`Contoh: ${defaultDurationDays}`}
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={durationInput}
            />
            <Text style={styles.fieldHint}>Default otomatis {defaultDurationDays} hari, tetap bisa diubah oleh admin.</Text>
          </View>

          <View style={styles.fieldGroup}>
            <View style={styles.switchRow}>
              <View style={styles.switchTextWrap}>
                <Text style={styles.label}>Status Layanan</Text>
                <Text style={styles.switchHint}>Layanan nonaktif tetap tersimpan tapi tidak diprioritaskan di transaksi.</Text>
              </View>
              <Pressable onPress={() => setActive((value) => !value)} style={[styles.switchChip, active ? styles.switchChipActive : null]}>
                <Text style={[styles.switchChipText, active ? styles.switchChipTextActive : null]}>{active ? "Aktif" : "Nonaktif"}</Text>
              </Pressable>
            </View>
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
    headerPanel: {
      gap: theme.spacing.xs,
      backgroundColor: theme.mode === "dark" ? "#12304a" : "#f2faff",
      borderColor: theme.colors.borderStrong,
    },
    headerTopRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    backButton: {
      width: 36,
      height: 36,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    backButtonPressed: {
      opacity: 0.84,
    },
    headerBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.04)" : "#ffffff",
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    headerBadgeText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 11,
      letterSpacing: 0.2,
      textTransform: "uppercase",
    },
    headerSpacer: {
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
      gap: theme.spacing.sm,
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
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
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
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
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
    pricePreview: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    fieldHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    switchRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    switchTextWrap: {
      flex: 1,
      gap: 3,
    },
    switchHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    switchChip: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
      alignItems: "center",
      justifyContent: "center",
      minWidth: 92,
    },
    switchChipActive: {
      borderColor: theme.colors.success,
      backgroundColor: theme.mode === "dark" ? "rgba(56,211,133,0.2)" : "rgba(56,211,133,0.15)",
    },
    switchChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
      letterSpacing: 0.2,
    },
    switchChipTextActive: {
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
    },
    saveHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
