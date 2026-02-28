import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { ServiceModuleHeader } from "../../components/services/ServiceModuleHeader";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { createService, updateService } from "../../features/services/serviceApi";
import { formatServiceDuration } from "../../features/services/defaultDuration";
import { listServiceProcessTags } from "../../features/services/serviceTagApi";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { ServiceProcessTag } from "../../types/service";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

type ServiceGroupFormRoute = RouteProp<AccountStackParamList, "ServiceGroupForm">;

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

export function ServiceGroupFormScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "ServiceGroupForm">>();
  const route = useRoute<ServiceGroupFormRoute>();
  const { session } = useSession();

  const roles = session?.roles ?? [];
  const canManage = hasAnyRole(roles, ["owner", "admin"]);
  const mode = route.params.mode;
  const isEdit = mode === "edit";
  const serviceType = route.params.serviceType;
  const group = route.params.group;
  const variants = group?.children ?? [];

  const [nameInput, setNameInput] = useState(group?.name ?? "");
  const [active, setActive] = useState(group?.active ?? true);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(group?.process_tags?.map((tag) => tag.id) ?? []);
  const [tags, setTags] = useState<ServiceProcessTag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const liveGroupName = nameInput.trim() || group?.name || "Group layanan";
  const headerSubtitle = isEdit
    ? `${formatServiceTypeLabel(serviceType)} • ${variants.length} varian`
    : `Group baru • ${formatServiceTypeLabel(serviceType)}`;

  const loadTags = useCallback(async () => {
    setLoadingTags(true);
    try {
      const data = await listServiceProcessTags({ forceRefresh: true });
      setTags(data.filter((tag) => tag.active));
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoadingTags(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadTags();
    }, [loadTags])
  );

  function toggleTag(tagId: string): void {
    setSelectedTagIds((previous) => {
      if (previous.includes(tagId)) {
        return previous.filter((id) => id !== tagId);
      }

      return [...previous, tagId];
    });
  }

  async function handleSave(nextAction: "back" | "addVariant" = "back"): Promise<void> {
    if (!canManage || saving) {
      return;
    }

    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setErrorMessage("Nama group layanan wajib diisi.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      let savedGroup = group ?? null;

      if (isEdit && group) {
        savedGroup = await updateService(group.id, {
          name: trimmedName,
          serviceType,
          parentServiceId: null,
          isGroup: true,
          unitType: "pcs",
          displayUnit: "pcs",
          basePriceAmount: group.base_price_amount,
          active,
          processTagIds: selectedTagIds,
        });
      } else {
        savedGroup = await createService({
          name: trimmedName,
          serviceType,
          parentServiceId: null,
          isGroup: true,
          unitType: "pcs",
          displayUnit: "pcs",
          basePriceAmount: 0,
          active,
          processTagIds: selectedTagIds,
        });
      }

      if (nextAction === "addVariant" && savedGroup) {
        navigation.navigate("ServiceVariantForm", {
          mode: "create",
          serviceType,
          parentServiceId: savedGroup.id,
        });
        return;
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
      <AppScreen contentContainerStyle={styles.screenShell}>
        <View style={styles.screenBody}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <ServiceModuleHeader onBack={() => navigation.goBack()} title={isEdit ? liveGroupName : "Tambah Group Layanan"}>
              <Text style={styles.subtitle}>{headerSubtitle}</Text>
            </ServiceModuleHeader>

            <AppPanel style={styles.formPanel}>
              <Text style={styles.label}>Nama Group</Text>
              <TextInput
                editable={!saving && canManage}
                onChangeText={setNameInput}
                placeholder="Contoh: Bed Cover"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={nameInput}
              />

              <Text style={styles.label}>Tag Proses</Text>
              <View style={styles.tagWrap}>
                {loadingTags ? <Text style={styles.helperText}>Memuat tag...</Text> : null}
                {!loadingTags && tags.length === 0 ? <Text style={styles.helperText}>Belum ada tag proses aktif.</Text> : null}
                {tags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id);
                  return (
                    <Pressable
                      key={tag.id}
                      onPress={() => toggleTag(tag.id)}
                      style={[styles.tagChip, selected ? styles.tagChipActive : null, { borderColor: selected ? tag.color_hex : theme.colors.border }]}
                    >
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

            <View style={styles.variantSection}>
              <View style={styles.variantSectionHeader}>
                <Text style={styles.label}>{isEdit ? "Varian dalam Group" : "Varian Group"}</Text>
                <View style={styles.variantHeaderActions}>
                  <Text style={styles.variantCount}>{variants.length} varian</Text>
                  {canManage ? (
                    <Pressable
                      onPress={() => {
                        if (group) {
                          navigation.navigate("ServiceVariantForm", {
                            mode: "create",
                            serviceType,
                            parentServiceId: group.id,
                          });
                          return;
                        }

                        void handleSave("addVariant");
                      }}
                      style={({ pressed }) => [styles.addVariantButton, pressed ? styles.addVariantButtonPressed : null]}
                    >
                      <Ionicons color={theme.colors.info} name="add" size={16} />
                      <Text style={styles.addVariantText}>Tambah Varian</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              {!isEdit ? (
                <Text style={styles.helperText}>Simpan group lalu form varian akan langsung dibuka.</Text>
              ) : variants.length === 0 ? (
                <Text style={styles.helperText}>Belum ada varian pada group ini.</Text>
              ) : (
                <View style={styles.variantList}>
                  {variants.map((variant) => (
                    <Pressable
                      key={variant.id}
                      disabled={!canManage}
                      onPress={() =>
                        navigation.navigate("ServiceVariantForm", {
                          mode: "edit",
                          serviceType,
                          variant,
                          parentServiceId: group?.id ?? null,
                        })
                      }
                      style={({ pressed }) => [styles.variantItem, canManage && pressed ? styles.variantItemPressed : null]}
                    >
                      <View style={styles.variantCopy}>
                        <Text style={styles.variantName}>{variant.name}</Text>
                        <Text style={styles.variantMeta}>
                          {(variant.display_unit ?? "pcs").toUpperCase()} • {formatServiceDuration(variant.duration_days, variant.duration_hours)}
                        </Text>
                      </View>
                      <View style={styles.variantRight}>
                        <Text style={styles.variantPrice}>Rp {variant.effective_price_amount.toLocaleString("id-ID")}</Text>
                        {canManage ? <Ionicons color={theme.colors.textMuted} name="chevron-forward" size={16} /> : null}
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            </AppPanel>

            {errorMessage ? (
              <View style={styles.errorWrap}>
                <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footerDock}>
            <AppButton disabled={!canManage || saving} loading={saving} onPress={() => void handleSave()} title={isEdit ? "Simpan Group" : "Buat Group"} />
          </View>
        </View>
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
    tagWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    helperText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    variantSection: {
      gap: theme.spacing.xs,
      paddingTop: theme.spacing.xs,
    },
    variantSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    variantHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    variantCount: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    addVariantButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      minHeight: 32,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 10,
    },
    addVariantButtonPressed: {
      opacity: 0.84,
    },
    addVariantText: {
      color: theme.colors.info,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    variantList: {
      gap: 8,
    },
    variantItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    variantItemPressed: {
      opacity: 0.84,
    },
    variantCopy: {
      flex: 1,
      gap: 2,
    },
    variantName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
      lineHeight: 20,
    },
    variantMeta: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    variantRight: {
      alignItems: "flex-end",
      gap: 2,
    },
    variantPrice: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
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
