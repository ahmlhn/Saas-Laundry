import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { archivePromotion, listPromotionSections } from "../../features/promotions/promoApi";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { Promotion, PromotionSections } from "../../types/promotion";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

interface StatusFilterOption {
  label: string;
  value: "active" | "all" | "draft" | "inactive";
}

const STATUS_FILTERS: StatusFilterOption[] = [
  { label: "Promo Aktif", value: "active" },
  { label: "Semua Promo", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Nonaktif", value: "inactive" },
];

function formatPromoTypeLabel(type: Promotion["promo_type"]): string {
  if (type === "selection") {
    return "Promo Pilihan";
  }

  if (type === "automatic") {
    return "Promo Otomatis";
  }

  return "Promo Voucher";
}

function formatPeriod(startAt: string | null, endAt: string | null): string {
  if (!startAt && !endAt) {
    return "Tanpa periode";
  }

  if (startAt && endAt) {
    return `${startAt.slice(0, 10)} s/d ${endAt.slice(0, 10)}`;
  }

  if (startAt) {
    return `Mulai ${startAt.slice(0, 10)}`;
  }

  return `Sampai ${endAt?.slice(0, 10)}`;
}

export function PromoScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "Promo">>();
  const { session } = useSession();
  const roles = session?.roles ?? [];
  const canManage = hasAnyRole(roles, ["owner", "admin"]);
  const canView = hasAnyRole(roles, ["owner", "admin", "cashier"]);

  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>(STATUS_FILTERS[0]);
  const [sections, setSections] = useState<PromotionSections>({
    selection: [],
    automatic: [],
    voucher: [],
  });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<keyof PromotionSections, boolean>>({
    selection: false,
    automatic: false,
    voucher: false,
  });
  const [activeActionPromo, setActiveActionPromo] = useState<Promotion | null>(null);
  const [busyPromoId, setBusyPromoId] = useState<string | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);

  const loadData = useCallback(async (isRefresh: boolean, statusValue: StatusFilterOption["value"]) => {
    if (!isRefresh) {
      setLoading(true);
    }

    try {
      const data = await listPromotionSections({
        status: statusValue,
        forceRefresh: isRefresh,
      });
      setSections(data);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!canView) {
        setLoading(false);
        return;
      }

      void loadData(true, statusFilter.value);
    }, [canView, loadData, statusFilter.value])
  );

  async function handleArchivePromo(promo: Promotion): Promise<void> {
    if (!canManage || busyPromoId) {
      return;
    }

    setBusyPromoId(promo.id);
    setErrorMessage(null);

    try {
      await archivePromotion(promo.id);
      setActiveActionPromo(null);
      await loadData(true, statusFilter.value);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setBusyPromoId(null);
    }
  }

  function renderSection(sectionKey: keyof PromotionSections, label: string, items: Promotion[]) {
    const isCollapsed = collapsed[sectionKey];

    return (
      <AppPanel style={styles.sectionPanel}>
        <Pressable
          onPress={() => setCollapsed((previous) => ({ ...previous, [sectionKey]: !previous[sectionKey] }))}
          style={styles.sectionHeader}
        >
          <Text style={styles.sectionTitle}>{label}</Text>
          <Ionicons color={theme.colors.info} name={isCollapsed ? "chevron-down" : "chevron-up"} size={19} />
        </Pressable>
        {!isCollapsed ? (
          <View style={styles.sectionContent}>
            {items.length === 0 ? <Text style={styles.emptyText}>Tidak ada data</Text> : null}
            {items.map((item) => (
              <View key={item.id} style={styles.promoItem}>
                <View style={styles.promoItemTextWrap}>
                  <Text style={styles.promoName}>{item.name}</Text>
                  <Text style={styles.promoMeta}>
                    {item.status.toUpperCase()} • {formatPeriod(item.start_at, item.end_at)}
                  </Text>
                </View>
                {canManage ? (
                  <Pressable onPress={() => setActiveActionPromo(item)} style={styles.kebabButton}>
                    <Ionicons color={theme.colors.warning} name="ellipsis-horizontal" size={20} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </AppPanel>
    );
  }

  if (!canView) {
    return (
      <AppScreen contentContainerStyle={styles.content} scroll>
        <AppPanel style={styles.headerPanel}>
          <Text style={styles.title}>Promo</Text>
          <Text style={styles.subtitle}>Akun Anda tidak memiliki akses ke modul ini.</Text>
        </AppPanel>
      </AppScreen>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <AppPanel style={styles.headerPanel}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.headerIconButton, pressed ? styles.headerIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
          </Pressable>
          <Text style={styles.title}>Promo</Text>
          <View style={styles.headerSpacer} />
        </View>
      </AppPanel>

      <Pressable onPress={() => setShowFilterMenu((value) => !value)} style={styles.filterButton}>
        <Text style={styles.filterText}>{statusFilter.label}</Text>
        <Ionicons color={theme.colors.textSecondary} name={showFilterMenu ? "chevron-up" : "chevron-down"} size={18} />
      </Pressable>
      {showFilterMenu ? (
        <AppPanel style={styles.filterMenu}>
          {STATUS_FILTERS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => {
                setShowFilterMenu(false);
                setStatusFilter(option);
                void loadData(true, option.value);
              }}
              style={[styles.filterMenuItem, statusFilter.value === option.value ? styles.filterMenuItemActive : null]}
            >
              <Text style={[styles.filterMenuText, statusFilter.value === option.value ? styles.filterMenuTextActive : null]}>{option.label}</Text>
            </Pressable>
          ))}
        </AppPanel>
      ) : null}

      {errorMessage ? (
        <View style={styles.errorWrap}>
          <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {loading ? (
        <AppPanel style={styles.sectionPanel}>
          <Text style={styles.emptyText}>Memuat data promo...</Text>
        </AppPanel>
      ) : (
        <>
          {renderSection("selection", "Promo Pilihan", sections.selection)}
          {renderSection("automatic", "Promo Otomatis", sections.automatic)}
          {renderSection("voucher", "Promo Voucher", sections.voucher)}
        </>
      )}

      {activeActionPromo && canManage ? (
        <AppPanel style={styles.actionPanel}>
          <Text style={styles.actionTitle}>{activeActionPromo.name}</Text>
          <Text style={styles.actionMeta}>{formatPromoTypeLabel(activeActionPromo.promo_type)}</Text>
          <View style={styles.actionButtonWrap}>
            <AppButton
              leftElement={<Ionicons color={theme.colors.info} name="create-outline" size={16} />}
              onPress={() => {
                navigation.navigate("PromoForm", {
                  mode: "edit",
                  promo: activeActionPromo,
                });
                setActiveActionPromo(null);
              }}
              title="Edit Promo"
              variant="secondary"
            />
          </View>
          <View style={styles.actionButtonWrap}>
            <AppButton
              disabled={busyPromoId === activeActionPromo.id}
              loading={busyPromoId === activeActionPromo.id}
              onPress={() => void handleArchivePromo(activeActionPromo)}
              title="Arsipkan Promo"
              variant="ghost"
            />
          </View>
          <View style={styles.actionButtonWrap}>
            <AppButton onPress={() => setActiveActionPromo(null)} title="Tutup" variant="ghost" />
          </View>
        </AppPanel>
      ) : null}

      {canManage ? (
        <Pressable onPress={() => navigation.navigate("PromoForm", { mode: "create" })} style={styles.fabButton}>
          <Ionicons color={theme.colors.primaryContrast} name="add" size={30} />
        </Pressable>
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
      paddingBottom: 120,
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
    headerIconButton: {
      width: 36,
      height: 36,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    headerIconButtonPressed: {
      opacity: 0.82,
    },
    headerSpacer: {
      width: 36,
      height: 36,
    },
    title: {
      flex: 1,
      textAlign: "center",
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: isTablet ? 30 : 24,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      textAlign: "center",
    },
    filterButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 16,
      minHeight: 48,
    },
    filterText: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
    },
    filterMenu: {
      gap: 6,
      paddingVertical: 8,
    },
    filterMenuItem: {
      borderRadius: theme.radii.md,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    filterMenuItemActive: {
      backgroundColor: theme.colors.primarySoft,
    },
    filterMenuText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    filterMenuTextActive: {
      color: theme.colors.info,
    },
    sectionPanel: {
      gap: theme.spacing.xs,
      paddingVertical: 12,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.info,
      fontFamily: theme.fonts.bold,
      fontSize: 18,
      lineHeight: 24,
    },
    sectionContent: {
      gap: 8,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingTop: 10,
    },
    emptyText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12.5,
      paddingVertical: 8,
    },
    promoItem: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    promoItemTextWrap: {
      flex: 1,
      gap: 2,
    },
    promoName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
      lineHeight: 19,
    },
    promoMeta: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    kebabButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    actionPanel: {
      gap: theme.spacing.xs,
    },
    actionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 14,
    },
    actionMeta: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    actionButtonWrap: {
      width: "100%",
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
    fabButton: {
      position: "absolute",
      right: 24,
      bottom: 30,
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: theme.colors.info,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: theme.colors.info,
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 6,
    },
  });
}
