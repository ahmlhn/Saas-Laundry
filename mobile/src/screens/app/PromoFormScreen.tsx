import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { createPromotion, updatePromotion } from "../../features/promotions/promoApi";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { PromotionCreatePayload, PromotionRule, PromotionStatus, PromotionType } from "../../types/promotion";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

type PromoFormRoute = RouteProp<AccountStackParamList, "PromoForm">;

const PROMO_TYPES: Array<{ label: string; value: PromotionType }> = [
  { label: "Promo Pilihan", value: "selection" },
  { label: "Promo Otomatis", value: "automatic" },
  { label: "Promo Voucher", value: "voucher" },
];

const STATUS_OPTIONS: Array<{ label: string; value: PromotionStatus }> = [
  { label: "Draft", value: "draft" },
  { label: "Aktif", value: "active" },
  { label: "Nonaktif", value: "inactive" },
  { label: "Expired", value: "expired" },
];

export function PromoFormScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "PromoForm">>();
  const route = useRoute<PromoFormRoute>();
  const { session } = useSession();
  const roles = session?.roles ?? [];
  const canManage = hasAnyRole(roles, ["owner", "admin"]);

  const mode = route.params.mode;
  const isEdit = mode === "edit";
  const promo = route.params.promo;
  const initialType = promo?.promo_type ?? route.params.presetType ?? "selection";

  const [promoType, setPromoType] = useState<PromotionType>(initialType);
  const [nameInput, setNameInput] = useState(promo?.name ?? "");
  const [status, setStatus] = useState<PromotionStatus>(promo?.status ?? "draft");
  const [priorityInput, setPriorityInput] = useState(String(promo?.priority ?? 0));
  const [stackMode, setStackMode] = useState<"exclusive" | "stackable">(promo?.stack_mode ?? "exclusive");
  const [startAtInput, setStartAtInput] = useState(promo?.start_at ? promo.start_at.slice(0, 19).replace("T", " ") : "");
  const [endAtInput, setEndAtInput] = useState(promo?.end_at ? promo.end_at.slice(0, 19).replace("T", " ") : "");
  const [targetType, setTargetType] = useState<"all" | "service_type">(promo?.targets?.[0]?.target_type === "service_type" ? "service_type" : "all");
  const [targetServiceType, setTargetServiceType] = useState<"regular" | "package" | "perfume" | "item">(
    promo?.targets?.[0]?.target_type === "service_type" && promo.targets[0].target_id
      ? (promo.targets[0].target_id as "regular" | "package" | "perfume" | "item")
      : "regular"
  );
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">(
    promo?.rule_json?.discount_type === "percentage" ? "percentage" : "fixed"
  );
  const [discountValueInput, setDiscountValueInput] = useState(String(promo?.rule_json?.discount_value ?? ""));
  const [minimumAmountInput, setMinimumAmountInput] = useState(String(promo?.rule_json?.minimum_amount ?? ""));
  const [maxDiscountInput, setMaxDiscountInput] = useState(String(promo?.rule_json?.max_discount ?? ""));
  const [notesInput, setNotesInput] = useState(promo?.notes ?? "");
  const [voucherCodeInput, setVoucherCodeInput] = useState(promo?.vouchers?.[0]?.code ?? "");
  const [voucherQuotaInput, setVoucherQuotaInput] = useState(
    promo?.vouchers?.[0]?.quota_total !== null && promo?.vouchers?.[0]?.quota_total !== undefined ? String(promo.vouchers[0].quota_total) : ""
  );
  const [voucherLimitInput, setVoucherLimitInput] = useState(
    promo?.vouchers?.[0]?.per_customer_limit !== null && promo?.vouchers?.[0]?.per_customer_limit !== undefined
      ? String(promo.vouchers[0].per_customer_limit)
      : ""
  );
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSave(): Promise<void> {
    if (!canManage || saving) {
      return;
    }

    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setErrorMessage("Nama promo wajib diisi.");
      return;
    }

    const priority = Number.parseInt(priorityInput || "0", 10);
    if (!Number.isFinite(priority)) {
      setErrorMessage("Prioritas tidak valid.");
      return;
    }

    const discountValue = Number.parseFloat(discountValueInput || "0");
    if (!Number.isFinite(discountValue) || discountValue <= 0) {
      setErrorMessage("Nilai diskon tidak valid.");
      return;
    }

    const minimumAmount = minimumAmountInput.trim() === "" ? undefined : Number.parseFloat(minimumAmountInput);
    if (minimumAmount !== undefined && (!Number.isFinite(minimumAmount) || minimumAmount < 0)) {
      setErrorMessage("Minimum order tidak valid.");
      return;
    }

    const maxDiscount = maxDiscountInput.trim() === "" ? undefined : Number.parseFloat(maxDiscountInput);
    if (maxDiscount !== undefined && (!Number.isFinite(maxDiscount) || maxDiscount < 0)) {
      setErrorMessage("Maksimum diskon tidak valid.");
      return;
    }

    if (promoType === "voucher" && voucherCodeInput.trim() === "") {
      setErrorMessage("Kode voucher wajib diisi untuk tipe voucher.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const appliesTo: PromotionRule["applies_to"] = targetType === "service_type" ? targetServiceType : "all";

      const payload: PromotionCreatePayload = {
        promoType,
        name: trimmedName,
        status,
        startAt: startAtInput.trim() || null,
        endAt: endAtInput.trim() || null,
        priority,
        stackMode,
        ruleJson: {
          discount_type: discountType,
          discount_value: discountValue,
          minimum_amount: minimumAmount,
          max_discount: maxDiscount,
          applies_to: appliesTo,
        },
        notes: notesInput.trim() || null,
        targets:
          targetType === "service_type"
            ? [
                {
                  targetType: "service_type" as const,
                  targetId: targetServiceType,
                },
              ]
            : [
                {
                  targetType: "all" as const,
                  targetId: null,
                },
              ],
        vouchers:
          promoType === "voucher"
            ? [
                {
                  code: voucherCodeInput.trim().toUpperCase(),
                  quotaTotal: voucherQuotaInput.trim() ? Number.parseInt(voucherQuotaInput, 10) : null,
                  perCustomerLimit: voucherLimitInput.trim() ? Number.parseInt(voucherLimitInput, 10) : null,
                  active: true,
                },
              ]
            : [],
      };

      if (isEdit && promo) {
        await updatePromotion(promo.id, payload);
      } else {
        await createPromotion(payload);
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
            <Text style={styles.title}>{isEdit ? "Edit Promo" : "Tambah Promo"}</Text>
            <View style={styles.spacer} />
          </View>
        </AppPanel>

        <AppPanel style={styles.formPanel}>
          <Text style={styles.label}>Tipe Promo</Text>
          <View style={styles.chipRow}>
            {PROMO_TYPES.map((option) => {
              const selected = promoType === option.value;
              return (
                <Pressable key={option.value} onPress={() => setPromoType(option.value)} style={[styles.chip, selected ? styles.chipActive : null]}>
                  <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Nama Promo</Text>
          <TextInput
            editable={!saving && canManage}
            onChangeText={setNameInput}
            placeholder="Contoh: Promo Bed Cover"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={nameInput}
          />

          <Text style={styles.label}>Status</Text>
          <View style={styles.chipRow}>
            {STATUS_OPTIONS.map((option) => {
              const selected = status === option.value;
              return (
                <Pressable key={option.value} onPress={() => setStatus(option.value)} style={[styles.chip, selected ? styles.chipActive : null]}>
                  <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Prioritas</Text>
          <TextInput
            editable={!saving && canManage}
            keyboardType="number-pad"
            onChangeText={setPriorityInput}
            placeholder="0"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={priorityInput}
          />

          <Text style={styles.label}>Mode Stack</Text>
          <View style={styles.chipRow}>
            {(["exclusive", "stackable"] as const).map((option) => {
              const selected = stackMode === option;
              return (
                <Pressable key={option} onPress={() => setStackMode(option)} style={[styles.chip, selected ? styles.chipActive : null]}>
                  <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>{option === "exclusive" ? "Exclusive" : "Stackable"}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Periode Mulai (opsional)</Text>
          <TextInput
            editable={!saving && canManage}
            onChangeText={setStartAtInput}
            placeholder="2026-02-23 10:00:00"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={startAtInput}
          />

          <Text style={styles.label}>Periode Selesai (opsional)</Text>
          <TextInput
            editable={!saving && canManage}
            onChangeText={setEndAtInput}
            placeholder="2026-03-01 10:00:00"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={endAtInput}
          />

          <Text style={styles.label}>Target Promo</Text>
          <View style={styles.chipRow}>
            {(["all", "service_type"] as const).map((option) => {
              const selected = targetType === option;
              return (
                <Pressable key={option} onPress={() => setTargetType(option)} style={[styles.chip, selected ? styles.chipActive : null]}>
                  <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>{option === "all" ? "Semua Layanan" : "Tipe Layanan"}</Text>
                </Pressable>
              );
            })}
          </View>

          {targetType === "service_type" ? (
            <View style={styles.chipRow}>
              {(["regular", "package", "perfume", "item"] as const).map((option) => {
                const selected = targetServiceType === option;
                return (
                  <Pressable key={option} onPress={() => setTargetServiceType(option)} style={[styles.chip, selected ? styles.chipActive : null]}>
                    <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>{option.toUpperCase()}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Text style={styles.label}>Jenis Diskon</Text>
          <View style={styles.chipRow}>
            {(["fixed", "percentage"] as const).map((option) => {
              const selected = discountType === option;
              return (
                <Pressable key={option} onPress={() => setDiscountType(option)} style={[styles.chip, selected ? styles.chipActive : null]}>
                  <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>{option === "fixed" ? "Nominal" : "Persentase"}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Nilai Diskon</Text>
          <TextInput
            editable={!saving && canManage}
            keyboardType="decimal-pad"
            onChangeText={setDiscountValueInput}
            placeholder={discountType === "fixed" ? "Contoh: 5000" : "Contoh: 10"}
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={discountValueInput}
          />

          <Text style={styles.label}>Minimum Order (opsional)</Text>
          <TextInput
            editable={!saving && canManage}
            keyboardType="decimal-pad"
            onChangeText={setMinimumAmountInput}
            placeholder="Contoh: 30000"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={minimumAmountInput}
          />

          <Text style={styles.label}>Maksimum Diskon (opsional)</Text>
          <TextInput
            editable={!saving && canManage}
            keyboardType="decimal-pad"
            onChangeText={setMaxDiscountInput}
            placeholder="Contoh: 15000"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={maxDiscountInput}
          />

          {promoType === "voucher" ? (
            <>
              <Text style={styles.label}>Kode Voucher</Text>
              <TextInput
                autoCapitalize="characters"
                editable={!saving && canManage}
                onChangeText={setVoucherCodeInput}
                placeholder="Contoh: WELCOME10"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={voucherCodeInput}
              />

              <Text style={styles.label}>Kuota Voucher (opsional)</Text>
              <TextInput
                editable={!saving && canManage}
                keyboardType="number-pad"
                onChangeText={setVoucherQuotaInput}
                placeholder="Contoh: 200"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={voucherQuotaInput}
              />

              <Text style={styles.label}>Limit per pelanggan (opsional)</Text>
              <TextInput
                editable={!saving && canManage}
                keyboardType="number-pad"
                onChangeText={setVoucherLimitInput}
                placeholder="Contoh: 1"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={voucherLimitInput}
              />
            </>
          ) : null}

          <Text style={styles.label}>Catatan (opsional)</Text>
          <TextInput
            editable={!saving && canManage}
            multiline
            numberOfLines={3}
            onChangeText={setNotesInput}
            placeholder="Catatan internal promo"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.notesInput]}
            value={notesInput}
          />
        </AppPanel>

        {errorMessage ? (
          <View style={styles.errorWrap}>
            <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <AppButton disabled={!canManage || saving} loading={saving} onPress={() => void handleSave()} title={isEdit ? "Simpan Promo" : "Buat Promo"} />
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
    formPanel: {
      gap: theme.spacing.xs,
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
    notesInput: {
      minHeight: 90,
      textAlignVertical: "top",
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    chip: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    chipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    chipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    chipTextActive: {
      color: theme.colors.info,
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
