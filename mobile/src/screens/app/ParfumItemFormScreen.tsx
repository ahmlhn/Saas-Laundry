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
import type { ServiceDisplayUnit } from "../../types/service";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

type ParfumItemFormRoute = RouteProp<AccountStackParamList, "ParfumItemForm">;

function normalizeDigits(value: string): string {
  return value.replace(/[^\d]/g, "");
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

  const [nameInput, setNameInput] = useState(item?.name ?? "");
  const [basePriceInput, setBasePriceInput] = useState(item ? String(item.base_price_amount) : "");
  const [durationInput, setDurationInput] = useState(item?.duration_days ? String(item.duration_days) : String(defaultDurationDays));
  const [displayUnit, setDisplayUnit] = useState<ServiceDisplayUnit>(
    item?.display_unit === "kg" || item?.display_unit === "pcs" || item?.display_unit === "satuan" ? item.display_unit : "satuan"
  );
  const [active, setActive] = useState(item?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

    const parsedDuration = durationInput.trim() === "" ? null : Number.parseInt(durationInput, 10);
    if (parsedDuration !== null && (!Number.isFinite(parsedDuration) || parsedDuration <= 0)) {
      setErrorMessage("Durasi hari tidak valid.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      if (isEdit && item) {
        await updateService(item.id, {
          name: trimmedName,
          serviceType,
          parentServiceId: null,
          isGroup: false,
          unitType: "pcs",
          displayUnit,
          basePriceAmount: parsedPrice,
          durationDays: parsedDuration,
          active,
        });
      } else {
        await createService({
          name: trimmedName,
          serviceType,
          parentServiceId: null,
          isGroup: false,
          unitType: "pcs",
          displayUnit,
          basePriceAmount: parsedPrice,
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
          <View style={styles.headerRow}>
            <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}>
              <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
            </Pressable>
            <Text style={styles.title}>{isEdit ? "Edit Data" : "Tambah Data"}</Text>
            <View style={styles.spacer} />
          </View>
          <Text style={styles.subtitle}>{serviceType === "perfume" ? "PARFUM" : "ITEM"}</Text>
        </AppPanel>

        <AppPanel style={styles.formPanel}>
          <Text style={styles.label}>Nama</Text>
          <TextInput
            editable={!saving && canManage}
            onChangeText={setNameInput}
            placeholder={serviceType === "perfume" ? "Contoh: Parfum Mawar" : "Contoh: Kemeja Panjang"}
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={nameInput}
          />

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

          <Text style={styles.label}>Durasi (hari)</Text>
          <TextInput
            editable={!saving && canManage}
            keyboardType="number-pad"
            onChangeText={(text) => setDurationInput(normalizeDigits(text))}
            placeholder={`Contoh: ${defaultDurationDays}`}
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={durationInput}
          />
          <Text style={styles.fieldHint}>Default otomatis {defaultDurationDays} hari, tetap bisa diubah oleh admin.</Text>

          <Text style={styles.label}>Satuan Tampil</Text>
          <View style={styles.segmentRow}>
            {(["satuan", "pcs", "kg"] as const).map((unit) => {
              const selected = displayUnit === unit;
              return (
                <Pressable key={unit} onPress={() => setDisplayUnit(unit)} style={[styles.segmentChip, selected ? styles.segmentChipActive : null]}>
                  <Text style={[styles.segmentText, selected ? styles.segmentTextActive : null]}>{unit.toUpperCase()}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.label}>Status</Text>
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

        <AppButton disabled={!canManage || saving} loading={saving} onPress={() => void handleSave()} title={isEdit ? "Simpan Data" : "Tambah Data"} />
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
      backgroundColor: theme.mode === "dark" ? "#12304a" : "#f7f9fb",
      gap: theme.spacing.xs,
    },
    headerRow: {
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
      opacity: 0.82,
    },
    spacer: {
      width: 36,
      height: 36,
    },
    title: {
      flex: 1,
      textAlign: "center",
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 23 : 21,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      textAlign: "center",
    },
    formPanel: {
      gap: theme.spacing.xs,
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
      flexWrap: "wrap",
      gap: 8,
    },
    segmentChip: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
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
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    statusChip: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.colors.surface,
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
  });
}
