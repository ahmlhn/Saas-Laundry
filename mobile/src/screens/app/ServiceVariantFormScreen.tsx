import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { ServiceModuleHeader } from "../../components/services/ServiceModuleHeader";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import {
  formatServiceDuration,
  getDefaultDurationUnit,
  resolveDurationPartsFromValue,
  resolveDurationValueAndUnit,
  type ServiceDurationUnit,
} from "../../features/services/defaultDuration";
import { archiveService, createService, listServices, updateService } from "../../features/services/serviceApi";
import { listServiceProcessTags } from "../../features/services/serviceTagApi";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { PackageAccumulationMode, PackageQuotaUnit, ServiceCatalogItem, ServiceDisplayUnit, ServiceProcessTag } from "../../types/service";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

type ServiceVariantFormRoute = RouteProp<AccountStackParamList, "ServiceVariantForm">;
type VariantIconOption = { label: string; value: keyof typeof Ionicons.glyphMap; emoji: string };
type VariantIconCategory = { label: string; tone: string; options: VariantIconOption[] };

const PACKAGE_MODES: Array<{ label: string; value: PackageAccumulationMode }> = [
  { label: "Akumulasi", value: "accumulative" },
  { label: "Jendela Tetap", value: "fixed_window" },
];

const VARIANT_ICON_CATEGORIES: VariantIconCategory[] = [
  {
    label: "Pakaian",
    tone: "#1f8ef1",
    options: [
      { label: "Baju", value: "shirt", emoji: "👕" },
      { label: "Gaun", value: "woman", emoji: "👗" },
      { label: "Formal", value: "briefcase", emoji: "👔" },
      { label: "Setrika", value: "cut", emoji: "🔥" },
    ],
  },
  {
    label: "Rumah Tangga",
    tone: "#0ea5a4",
    options: [
      { label: "Bedcover", value: "bed", emoji: "🛏" },
      { label: "Keranjang", value: "basket", emoji: "🧺" },
      { label: "Lemari", value: "archive", emoji: "🗂" },
      { label: "Umum", value: "cube", emoji: "📦" },
    ],
  },
  {
    label: "Aksesori",
    tone: "#f97316",
    options: [
      { label: "Tas", value: "bag-handle", emoji: "👜" },
      { label: "Sepatu", value: "footsteps", emoji: "👟" },
      { label: "Boneka", value: "happy", emoji: "🧸" },
      { label: "Premium", value: "diamond", emoji: "💎" },
    ],
  },
  {
    label: "Spesial",
    tone: "#a855f7",
    options: [
      { label: "Kilat", value: "flash", emoji: "⚡" },
      { label: "Basah", value: "water", emoji: "💦" },
      { label: "Parfum", value: "flower", emoji: "🌸" },
      { label: "Paket", value: "apps", emoji: "🎁" },
    ],
  },
];

const VARIANT_ICON_OPTIONS = VARIANT_ICON_CATEGORIES.flatMap((category) => category.options);

const LEGACY_ICON_MAP: Partial<Record<string, keyof typeof Ionicons.glyphMap>> = {
  "shirt-outline": "shirt",
  "bed-outline": "bed",
  "basket-outline": "basket",
  "bag-handle-outline": "bag-handle",
  "cube-outline": "cube",
  "ribbon-outline": "diamond",
  "sparkles-outline": "flash",
  "water-outline": "water",
  "cut-outline": "cut",
  "flower-outline": "flower",
  "apps-outline": "apps",
  "archive-outline": "archive",
};

const currencyFormatter = new Intl.NumberFormat("id-ID");

function normalizeDigits(value: string): string {
  return value.replace(/[^\d]/g, "");
}

function formatPriceInput(value: string): string {
  const digits = normalizeDigits(value);
  if (!digits) {
    return "";
  }

  const parsed = Number.parseInt(digits, 10);
  if (!Number.isFinite(parsed)) {
    return "";
  }

  return `Rp ${currencyFormatter.format(parsed)}`;
}

function formatServiceTypeLabel(serviceType: string): string {
  switch (serviceType) {
    case "regular":
      return "Reguler";
    case "package":
      return "Paket";
    case "perfume":
      return "Parfum";
    case "item":
      return "Item";
    default:
      return serviceType;
  }
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

function normalizeVariantIcon(iconName: string | null | undefined): keyof typeof Ionicons.glyphMap {
  if (iconName && VARIANT_ICON_OPTIONS.some((option) => option.value === iconName)) {
    return iconName as keyof typeof Ionicons.glyphMap;
  }

  if (iconName && LEGACY_ICON_MAP[iconName]) {
    return LEGACY_ICON_MAP[iconName] as keyof typeof Ionicons.glyphMap;
  }

  return "shirt";
}

export function ServiceVariantFormScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "ServiceVariantForm">>();
  const route = useRoute<ServiceVariantFormRoute>();
  const { session, selectedOutlet } = useSession();

  const roles = session?.roles ?? [];
  const canManage = hasAnyRole(roles, ["owner", "admin"]);
  const mode = route.params.mode;
  const isEdit = mode === "edit";
  const serviceType = route.params.serviceType;
  const variant = route.params.variant;
  const defaultDuration = resolveDurationValueAndUnit(variant?.duration_days, variant?.duration_hours, serviceType);

  const [groups, setGroups] = useState<ServiceCatalogItem[]>([]);
  const [tags, setTags] = useState<ServiceProcessTag[]>([]);
  const [loadingReferences, setLoadingReferences] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [nameInput, setNameInput] = useState(variant?.name ?? "");
  const [parentServiceId, setParentServiceId] = useState<string | null>(
    variant?.parent_service_id ?? route.params.parentServiceId ?? null
  );
  const [basePriceInput, setBasePriceInput] = useState(variant ? String(variant.base_price_amount) : "");
  const [durationInput, setDurationInput] = useState(String(defaultDuration.value));
  const [durationUnit, setDurationUnit] = useState<ServiceDurationUnit>(defaultDuration.unit ?? getDefaultDurationUnit(serviceType));
  const [displayUnit, setDisplayUnit] = useState<ServiceDisplayUnit>(
    variant?.display_unit === "kg" || variant?.display_unit === "pcs" || variant?.display_unit === "meter"
      ? variant.display_unit
      : variant?.unit_type === "kg"
        ? "kg"
        : variant?.unit_type === "meter"
          ? "meter"
        : "pcs"
  );
  const [imageIcon, setImageIcon] = useState<keyof typeof Ionicons.glyphMap>(normalizeVariantIcon(variant?.image_icon));
  const [active, setActive] = useState(variant?.active ?? true);
  const [showInCashier, setShowInCashier] = useState(variant?.show_in_cashier ?? true);
  const [showToCustomer, setShowToCustomer] = useState(variant?.show_to_customer ?? true);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(variant?.process_tags?.map((tag) => tag.id) ?? []);
  const [iconPickerVisible, setIconPickerVisible] = useState(false);

  const [packageQuotaInput, setPackageQuotaInput] = useState(variant?.package_quota_value ? String(variant.package_quota_value) : "");
  const [packageQuotaUnit, setPackageQuotaUnit] = useState<PackageQuotaUnit>(variant?.package_quota_unit === "kg" ? "kg" : "pcs");
  const [packageValidDaysInput, setPackageValidDaysInput] = useState(variant?.package_valid_days ? String(variant.package_valid_days) : "");
  const [packageMode, setPackageMode] = useState<PackageAccumulationMode>(
    variant?.package_accumulation_mode === "fixed_window" ? "fixed_window" : "accumulative"
  );

  const isPackage = serviceType === "package";
  const selectedGroup = groups.find((groupItem) => groupItem.id === parentServiceId) ?? null;
  const liveVariantName = nameInput.trim() || variant?.name || "Varian layanan";
  const parsedHeaderPrice = Number.parseInt(basePriceInput, 10);
  const headerPriceLabel = Number.isFinite(parsedHeaderPrice) ? `Rp ${currencyFormatter.format(parsedHeaderPrice)}` : "Harga belum diatur";
  const previewDurationValue = durationInput.trim() === "" ? defaultDuration.value : Number.parseInt(durationInput, 10);
  const headerDurationLabel = formatServiceDuration(
    durationUnit === "day" ? previewDurationValue : 0,
    durationUnit === "hour" ? previewDurationValue : 0,
    "Durasi belum diatur"
  );
  const defaultDurationLabel = formatServiceDuration(defaultDuration.unit === "day" ? defaultDuration.value : 0, defaultDuration.unit === "hour" ? defaultDuration.value : 0);
  const headerSubtitle = isEdit
    ? `${selectedGroup?.name ?? "Belum pilih group"} • ${headerPriceLabel} • ${headerDurationLabel}`
    : `${formatServiceTypeLabel(serviceType)} • ${selectedGroup?.name ?? "Belum pilih group"}`;

  const loadReferences = useCallback(async () => {
    setLoadingReferences(true);
    try {
      const [groupData, tagData] = await Promise.all([
        listServices({
          outletId: selectedOutlet?.id,
          serviceType,
          parentId: null,
          isGroup: true,
          includeDeleted: false,
          active: true,
          forceRefresh: true,
        }),
        listServiceProcessTags({ forceRefresh: true }),
      ]);
      setGroups(groupData);
      setTags(tagData.filter((tag) => tag.active));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoadingReferences(false);
    }
  }, [serviceType, selectedOutlet?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadReferences();
    }, [loadReferences])
  );

  function toggleTag(tagId: string): void {
    setSelectedTagIds((previous) => {
      if (previous.includes(tagId)) {
        return previous.filter((id) => id !== tagId);
      }

      return [...previous, tagId];
    });
  }

  async function handleSave(): Promise<void> {
    if (!canManage || saving || deleting) {
      return;
    }

    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setErrorMessage("Nama varian layanan wajib diisi.");
      return;
    }

    const parsedBasePrice = Number.parseInt(normalizeDigits(basePriceInput), 10);
    if (!Number.isFinite(parsedBasePrice) || parsedBasePrice < 0) {
      setErrorMessage("Harga dasar tidak valid.");
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

    if ((serviceType === "regular" || serviceType === "package") && !parentServiceId) {
      setErrorMessage("Pilih group layanan terlebih dahulu.");
      return;
    }

    let packageQuotaValue: number | null = null;
    let packageValidDays: number | null = null;
    if (isPackage) {
      packageQuotaValue = Number.parseFloat(packageQuotaInput);
      packageValidDays = Number.parseInt(packageValidDaysInput, 10);

      if (!Number.isFinite(packageQuotaValue) || packageQuotaValue <= 0) {
        setErrorMessage("Kuota paket tidak valid.");
        return;
      }

      if (!Number.isFinite(packageValidDays) || packageValidDays <= 0) {
        setErrorMessage("Masa aktif paket tidak valid.");
        return;
      }
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const unitType = resolveUnitTypeFromDisplayUnit(displayUnit);

      if (isEdit && variant) {
        await updateService(variant.id, {
          name: trimmedName,
          serviceType,
          parentServiceId,
          isGroup: false,
          unitType,
          displayUnit,
          basePriceAmount: parsedBasePrice,
          durationDays: resolvedDuration.durationDays,
          durationHours: resolvedDuration.durationHours,
          packageQuotaValue,
          packageQuotaUnit: isPackage ? packageQuotaUnit : null,
          packageValidDays,
          packageAccumulationMode: isPackage ? packageMode : null,
          imageIcon,
          active,
          showInCashier,
          showToCustomer,
          processTagIds: selectedTagIds,
        });
      } else {
        await createService({
          name: trimmedName,
          serviceType,
          parentServiceId,
          isGroup: false,
          unitType,
          displayUnit,
          basePriceAmount: parsedBasePrice,
          durationDays: resolvedDuration.durationDays,
          durationHours: resolvedDuration.durationHours,
          packageQuotaValue,
          packageQuotaUnit: isPackage ? packageQuotaUnit : null,
          packageValidDays,
          packageAccumulationMode: isPackage ? packageMode : null,
          imageIcon,
          active,
          showInCashier,
          showToCustomer,
          processTagIds: selectedTagIds,
        });
      }

      navigation.goBack();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!variant || !canManage || saving || deleting) {
      return;
    }

    setDeleting(true);
    setErrorMessage(null);

    try {
      await archiveService(variant.id);
      navigation.goBack();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  function confirmDelete(): void {
    if (!variant) {
      return;
    }

    Alert.alert(
      "Hapus Varian",
      `Varian "${variant.name}" akan diarsipkan. Lanjutkan?`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: () => {
            void handleDelete();
          },
        },
      ],
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <AppScreen contentContainerStyle={styles.screenShell}>
        <View style={styles.screenBody}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <ServiceModuleHeader onBack={() => navigation.goBack()} title={isEdit ? liveVariantName : "Tambah Varian"}>
              <Text style={styles.subtitle}>{headerSubtitle}</Text>
            </ServiceModuleHeader>

            <AppPanel style={styles.formPanel}>
              <Text style={styles.label}>Nama Varian</Text>
              <TextInput
                editable={!saving && canManage}
                onChangeText={setNameInput}
                placeholder="Contoh: Queen"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={nameInput}
              />

              <Text style={styles.label}>Group</Text>
              {loadingReferences ? <Text style={styles.helperText}>Memuat group...</Text> : null}
              {!loadingReferences && groups.length === 0 ? (
                <Text style={styles.helperText}>Belum ada group. Tambahkan group dulu.</Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.chipRow}>
                    {groups.map((groupItem) => {
                      const selected = parentServiceId === groupItem.id;
                      return (
                        <Pressable key={groupItem.id} onPress={() => setParentServiceId(groupItem.id)} style={[styles.chip, selected ? styles.chipActive : null]}>
                          <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>{groupItem.name}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              )}

              <Text style={styles.label}>Harga</Text>
              <TextInput
                editable={!saving && canManage}
                keyboardType="number-pad"
                onChangeText={(text) => setBasePriceInput(normalizeDigits(text))}
                placeholder="Contoh: Rp 15.000"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={formatPriceInput(basePriceInput)}
              />

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
                  ] as const).map((option) => (
                    <Pressable
                      key={option.value}
                      onPress={() => setDurationUnit(option.value)}
                      style={[styles.chip, durationUnit === option.value ? styles.chipActive : null]}
                    >
                      <Text style={[styles.chipText, durationUnit === option.value ? styles.chipTextActive : null]}>{option.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Text style={styles.helperText}>
                Default otomatis {defaultDurationLabel}, tetap bisa diubah sebelum disimpan.
              </Text>

              <Text style={styles.label}>Satuan Hitung</Text>
              <View style={styles.chipRowWrap}>
                {(["kg", "pcs", "meter"] as const).map((unit) => {
                  const selected = displayUnit === unit;
                  return (
                    <Pressable key={unit} onPress={() => setDisplayUnit(unit)} style={[styles.chip, selected ? styles.chipActive : null]}>
                      <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>{unit.toUpperCase()}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.helperText}>
                Satuan hitung order otomatis mengikuti pilihan ini: {resolveUnitTypeFromDisplayUnit(displayUnit).toUpperCase()}.
              </Text>

              {isPackage ? (
                <>
                  <Text style={styles.label}>Kuota Paket</Text>
                  <TextInput
                    editable={!saving && canManage}
                    keyboardType="decimal-pad"
                    onChangeText={setPackageQuotaInput}
                    placeholder="Contoh: 10"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                    value={packageQuotaInput}
                  />

                  <Text style={styles.label}>Unit Kuota Paket</Text>
                  <View style={styles.chipRowWrap}>
                    {(["kg", "pcs"] as const).map((unit) => {
                      const selected = packageQuotaUnit === unit;
                      return (
                        <Pressable key={unit} onPress={() => setPackageQuotaUnit(unit)} style={[styles.chip, selected ? styles.chipActive : null]}>
                          <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>{unit.toUpperCase()}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={styles.label}>Masa Aktif Paket (hari)</Text>
                  <TextInput
                    editable={!saving && canManage}
                    keyboardType="number-pad"
                    onChangeText={(text) => setPackageValidDaysInput(normalizeDigits(text))}
                    placeholder="Contoh: 30"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                    value={packageValidDaysInput}
                  />

                  <Text style={styles.label}>Mode Akumulasi</Text>
                  <View style={styles.chipRowWrap}>
                    {PACKAGE_MODES.map((option) => {
                      const selected = packageMode === option.value;
                      return (
                        <Pressable key={option.value} onPress={() => setPackageMode(option.value)} style={[styles.chip, selected ? styles.chipActive : null]}>
                          <Text style={[styles.chipText, selected ? styles.chipTextActive : null]}>{option.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <Text style={styles.label}>Ikon Varian</Text>
              <Pressable onPress={() => setIconPickerVisible(true)} style={({ pressed }) => [styles.iconPickerPreview, pressed ? styles.iconPickerPreviewPressed : null]}>
                <View style={styles.iconPreviewBadge}>
                  <Text style={styles.iconPreviewEmoji}>
                    {VARIANT_ICON_OPTIONS.find((option) => option.value === imageIcon)?.emoji ?? "👕"}
                  </Text>
                </View>
                <View style={styles.iconPreviewCopy}>
                  <Text style={styles.iconPreviewTitle}>
                    {VARIANT_ICON_OPTIONS.find((option) => option.value === imageIcon)?.label ?? "Ikon terpilih"}
                  </Text>
                  <Text style={styles.helperText}>Ketuk untuk memilih ikon varian per kategori.</Text>
                </View>
                <Ionicons color={theme.colors.textMuted} name="chevron-down-outline" size={20} />
              </Pressable>

              <Text style={styles.label}>Tag Proses</Text>
              <View style={styles.tagWrap}>
                {tags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id);
                  return (
                    <Pressable key={tag.id} onPress={() => toggleTag(tag.id)} style={[styles.tagChip, selected ? styles.tagChipActive : null]}>
                      <View style={[styles.tagDot, { backgroundColor: tag.color_hex }]} />
                      <Text style={[styles.tagText, selected ? styles.tagTextActive : null]}>{tag.name}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.statusRow}>
                <Text style={styles.label}>Status</Text>
                <Pressable onPress={() => setActive((value) => !value)} style={[styles.statusChip, active ? styles.statusChipActive : null]}>
                  <Text style={[styles.statusChipText, active ? styles.statusChipTextActive : null]}>{active ? "Aktif" : "Nonaktif"}</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Opsi Layanan</Text>
              <View style={styles.optionList}>
                <Pressable onPress={() => setShowInCashier((value) => !value)} style={styles.optionRow}>
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>Ditampilkan di Kasir</Text>
                    <Text style={styles.optionCaption}>Muncul di daftar layanan saat buat pesanan.</Text>
                  </View>
                  <View style={[styles.optionToggle, showInCashier ? styles.optionToggleActive : null]}>
                    <Text style={[styles.optionToggleText, showInCashier ? styles.optionToggleTextActive : null]}>
                      {showInCashier ? "Aktif" : "Nonaktif"}
                    </Text>
                  </View>
                </Pressable>

                <Pressable onPress={() => setShowToCustomer((value) => !value)} style={styles.optionRow}>
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>Ditampilkan ke Pelanggan</Text>
                    <Text style={styles.optionCaption}>Disiapkan untuk tampilan customer-facing dan e-nota.</Text>
                  </View>
                  <View style={[styles.optionToggle, showToCustomer ? styles.optionToggleActive : null]}>
                    <Text style={[styles.optionToggleText, showToCustomer ? styles.optionToggleTextActive : null]}>
                      {showToCustomer ? "Aktif" : "Nonaktif"}
                    </Text>
                  </View>
                </Pressable>
              </View>

              {isEdit ? (
                <View style={styles.deleteActionWrap}>
                  <AppButton
                    disabled={!canManage || saving || deleting}
                    loading={deleting}
                    onPress={confirmDelete}
                    title="Hapus Varian"
                    variant="ghost"
                  />
                </View>
              ) : null}
            </AppPanel>

            {errorMessage ? (
              <View style={styles.errorWrap}>
                <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footerDock}>
            <View style={styles.footerActions}>
              <View style={styles.primaryActionFull}>
                <AppButton
                  disabled={!canManage || saving || deleting}
                  loading={saving}
                  onPress={() => void handleSave()}
                  title={isEdit ? "Simpan Varian" : "Buat Varian"}
                />
              </View>
            </View>
          </View>
        </View>

        <Modal animationType="fade" onRequestClose={() => setIconPickerVisible(false)} transparent visible={iconPickerVisible}>
          <View style={styles.iconModalOverlay}>
            <Pressable onPress={() => setIconPickerVisible(false)} style={StyleSheet.absoluteFill} />
            <AppPanel style={styles.iconModalCard}>
              <View style={styles.iconModalHeader}>
                <View>
                  <Text style={styles.iconModalTitle}>Pilih Ikon Varian</Text>
                  <Text style={styles.helperText}>Gunakan ikon yang paling mendekati jenis layanan.</Text>
                </View>
                <Pressable onPress={() => setIconPickerVisible(false)} style={styles.iconModalClose}>
                  <Ionicons color={theme.colors.textSecondary} name="close-outline" size={20} />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.iconModalContent} showsVerticalScrollIndicator={false}>
                {VARIANT_ICON_CATEGORIES.map((category) => (
                  <View key={category.label} style={styles.iconCategorySection}>
                    <View style={styles.iconCategoryHeader}>
                      <View style={[styles.iconCategoryDot, { backgroundColor: category.tone }]} />
                      <Text style={styles.iconCategoryTitle}>{category.label}</Text>
                    </View>
                    <View style={styles.iconGrid}>
                      {category.options.map((option) => {
                        const selected = imageIcon === option.value;
                        return (
                          <Pressable
                            key={option.value}
                            onPress={() => {
                              setImageIcon(option.value);
                              setIconPickerVisible(false);
                            }}
                            style={[
                              styles.iconOption,
                              { backgroundColor: `${category.tone}10` },
                              selected ? [styles.iconOptionActive, { borderColor: category.tone, backgroundColor: `${category.tone}1e` }] : null,
                            ]}
                          >
                            <View style={[styles.iconOptionBadge, { backgroundColor: `${category.tone}22` }]}>
                              <Text style={styles.iconOptionEmoji}>{option.emoji}</Text>
                            </View>
                            <Text style={[styles.iconOptionLabel, selected ? [styles.iconOptionLabelActive, { color: category.tone }] : null]}>{option.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </ScrollView>
            </AppPanel>
          </View>
        </Modal>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    screenShell: {
      flex: 1,
    },
    screenBody: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg,
      paddingTop: isCompactLandscape ? theme.spacing.sm : theme.spacing.md,
      paddingBottom: 132,
      gap: theme.spacing.sm,
    },
    footerDock: {
      paddingHorizontal: isTablet ? theme.spacing.xl : theme.spacing.lg,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.lg,
      backgroundColor: theme.colors.background,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    footerActions: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      alignItems: "center",
    },
    primaryAction: {
      flex: 1.2,
    },
    primaryActionFull: {
      flex: 1,
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
    helperText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#3f90c4" : "#79d2f0",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "rgba(31, 67, 99, 0.95)" : "#f1fbff",
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
      shadowColor: theme.mode === "dark" ? "#000000" : "#66c7ec",
      shadowOpacity: theme.mode === "dark" ? 0.14 : 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
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
      alignItems: "stretch",
      gap: 8,
    },
    chipRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    chipRowWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    chip: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 7,
      backgroundColor: theme.colors.surface,
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
    tagWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    iconPickerPreview: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#3f90c4" : "#b6e7f6",
      borderRadius: theme.radii.lg,
      backgroundColor: theme.mode === "dark" ? "rgba(31, 67, 99, 0.72)" : "#f4fcff",
    },
    iconPickerPreviewPressed: {
      opacity: 0.9,
    },
    iconPreviewBadge: {
      width: 56,
      height: 56,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#5fa7d8" : "#9fd9ee",
      backgroundColor: theme.mode === "dark" ? "rgba(17, 48, 72, 0.95)" : "#ffffff",
      alignItems: "center",
      justifyContent: "center",
    },
    iconPreviewEmoji: {
      fontSize: 28,
      lineHeight: 30,
      textAlign: "center",
      includeFontPadding: false,
    },
    iconPreviewCopy: {
      flex: 1,
      gap: 2,
    },
    iconPreviewTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    iconGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    iconOption: {
      width: 84,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      paddingHorizontal: 10,
      paddingVertical: 12,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    iconOptionActive: {
      borderColor: theme.colors.info,
    },
    iconOptionBadge: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    iconOptionEmoji: {
      fontSize: 22,
      lineHeight: 24,
      textAlign: "center",
      includeFontPadding: false,
    },
    iconOptionLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      textAlign: "center",
    },
    iconOptionLabelActive: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
    },
    iconModalOverlay: {
      flex: 1,
      backgroundColor: "rgba(7, 18, 31, 0.32)",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: isTablet ? 48 : 20,
    },
    iconModalCard: {
      width: "100%",
      maxWidth: 420,
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.lg,
      maxHeight: "76%",
    },
    iconModalHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: theme.spacing.md,
    },
    iconModalTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 16,
    },
    iconModalClose: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    iconModalContent: {
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.xs,
    },
    iconCategorySection: {
      gap: theme.spacing.sm,
    },
    iconCategoryHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    iconCategoryDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    iconCategoryTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    tagChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: theme.colors.surface,
    },
    tagChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    tagDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    tagText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    tagTextActive: {
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
    statusChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    statusChipTextActive: {
      color: theme.colors.success,
    },
    optionList: {
      gap: theme.spacing.sm,
    },
    optionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: theme.mode === "dark" ? "rgba(80,140,255,0.1)" : "#eef8ff",
    },
    optionCopy: {
      flex: 1,
      gap: 2,
    },
    optionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    optionCaption: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
      lineHeight: 16,
    },
    optionToggle: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.colors.surface,
    },
    optionToggleActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    optionToggleText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    optionToggleTextActive: {
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
    deleteActionWrap: {
      marginTop: theme.spacing.sm,
      paddingTop: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
  });
}
