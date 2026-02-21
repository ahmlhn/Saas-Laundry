import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { AppSkeletonBlock } from "../../components/ui/AppSkeletonBlock";
import { StatusPill } from "../../components/ui/StatusPill";
import { createShippingZone, listShippingZones } from "../../features/shippingZones/shippingZoneApi";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { ShippingZone } from "../../types/shippingZone";

type ShippingZonesRoute = RouteProp<AccountStackParamList, "ShippingZones">;

const currencyFormatter = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(value)}`;
}

function formatDistanceRange(item: ShippingZone): string {
  const min = item.min_distance_km;
  const max = item.max_distance_km;

  if (min === null && max === null) {
    return "Semua jarak";
  }

  if (min !== null && max === null) {
    return `${min} km ke atas`;
  }

  if (min === null && max !== null) {
    return `Sampai ${max} km`;
  }

  return `${min} - ${max} km`;
}

export function ShippingZonesScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "ShippingZones">>();
  const route = useRoute<ShippingZonesRoute>();
  const { session, selectedOutlet } = useSession();
  const roles = session?.roles ?? [];
  const canView = hasAnyRole(roles, ["owner", "admin"]);
  const allowedOutlets = session?.allowed_outlets ?? [];

  const initialOutletId = route.params?.outletId ?? selectedOutlet?.id ?? allowedOutlets[0]?.id ?? "";
  const [activeOutletId, setActiveOutletId] = useState(initialOutletId);
  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [minDistanceKm, setMinDistanceKm] = useState("");
  const [maxDistanceKm, setMaxDistanceKm] = useState("");
  const [etaMinutes, setEtaMinutes] = useState("");
  const [notes, setNotes] = useState("");

  const activeOutlet = allowedOutlets.find((item) => item.id === activeOutletId) ?? null;
  const headerOutletLabel = route.params?.outletLabel ?? (activeOutlet ? `${activeOutlet.code} - ${activeOutlet.name}` : "Outlet belum dipilih");

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    if (!activeOutletId) {
      setLoading(false);
      return;
    }

    void loadZones(false, true);
  }, [canView, activeOutletId, showInactive]);

  async function loadZones(isRefresh: boolean, forceRefresh = false): Promise<void> {
    if (!activeOutletId) {
      setZones([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage(null);

    try {
      const data = await listShippingZones({
        outletId: activeOutletId,
        active: showInactive ? undefined : true,
        forceRefresh: isRefresh || forceRefresh,
      });
      setZones(data);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function resetForm(): void {
    setName("");
    setFeeAmount("");
    setMinDistanceKm("");
    setMaxDistanceKm("");
    setEtaMinutes("");
    setNotes("");
  }

  async function handleCreateZone(): Promise<void> {
    if (!activeOutletId || saving) {
      return;
    }

    const normalizedName = name.trim();
    const fee = Number.parseInt(feeAmount.trim(), 10);
    const minDistance = minDistanceKm.trim() ? Number.parseFloat(minDistanceKm.trim()) : undefined;
    const maxDistance = maxDistanceKm.trim() ? Number.parseFloat(maxDistanceKm.trim()) : undefined;
    const eta = etaMinutes.trim() ? Number.parseInt(etaMinutes.trim(), 10) : undefined;

    if (!normalizedName) {
      setErrorMessage("Nama zona wajib diisi.");
      return;
    }

    if (!Number.isFinite(fee) || fee < 0) {
      setErrorMessage("Biaya antar harus berupa angka >= 0.");
      return;
    }

    if (minDistance !== undefined && (!Number.isFinite(minDistance) || minDistance < 0)) {
      setErrorMessage("Jarak minimum tidak valid.");
      return;
    }

    if (maxDistance !== undefined && (!Number.isFinite(maxDistance) || maxDistance < 0)) {
      setErrorMessage("Jarak maksimum tidak valid.");
      return;
    }

    if (minDistance !== undefined && maxDistance !== undefined && minDistance > maxDistance) {
      setErrorMessage("Jarak minimum tidak boleh lebih besar dari jarak maksimum.");
      return;
    }

    if (eta !== undefined && (!Number.isFinite(eta) || eta <= 0)) {
      setErrorMessage("Estimasi menit harus lebih dari 0.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      await createShippingZone({
        outletId: activeOutletId,
        name: normalizedName,
        feeAmount: fee,
        minDistanceKm: minDistance,
        maxDistanceKm: maxDistance,
        etaMinutes: eta,
        notes,
      });
      setActionMessage("Zona antar berhasil ditambahkan.");
      resetForm();
      await loadZones(false, true);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function renderSkeletonList() {
    return (
      <View style={styles.skeletonWrap}>
        {Array.from({ length: 3 }).map((_, index) => (
          <View key={`zone-skeleton-${index}`} style={styles.skeletonCard}>
            <AppSkeletonBlock height={14} width="48%" />
            <AppSkeletonBlock height={11} width="64%" />
            <AppSkeletonBlock height={11} width="38%" />
          </View>
        ))}
      </View>
    );
  }

  function renderItem({ item }: { item: ShippingZone }) {
    return (
      <View style={styles.zoneCard}>
        <View style={styles.zoneTop}>
          <View style={styles.zoneTitleWrap}>
            <Text style={styles.zoneName}>{item.name}</Text>
            <Text style={styles.zoneMeta}>{formatDistanceRange(item)}</Text>
          </View>
          <StatusPill label={item.active ? "Aktif" : "Nonaktif"} tone={item.active ? "success" : "warning"} />
        </View>
        <Text style={styles.zoneMeta}>Biaya antar: {formatMoney(item.fee_amount)}</Text>
        {item.eta_minutes ? <Text style={styles.zoneMeta}>Estimasi: {item.eta_minutes} menit</Text> : null}
        {item.notes ? <Text style={styles.zoneMeta}>Catatan: {item.notes}</Text> : null}
      </View>
    );
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
              <Ionicons color={theme.colors.info} name="navigate-outline" size={15} />
              <Text style={styles.heroBadgeText}>Zona Antar</Text>
            </View>
            <View style={styles.heroSpacer} />
          </View>
          <Text style={styles.title}>Zona Antar</Text>
          <Text style={styles.subtitle}>Akun Anda tidak memiliki akses untuk membuka modul ini.</Text>
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
            <Ionicons color={theme.colors.info} name="navigate-outline" size={15} />
            <Text style={styles.heroBadgeText}>Zona Antar</Text>
          </View>
          <Pressable onPress={() => void loadZones(true, true)} style={({ pressed }) => [styles.heroIconButton, pressed ? styles.heroIconButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="refresh-outline" size={18} />
          </Pressable>
        </View>
        <Text style={styles.title}>Zona Antar</Text>
        <Text style={styles.subtitle}>{headerOutletLabel}</Text>
      </AppPanel>

      {allowedOutlets.length > 1 ? (
        <View style={styles.outletChipRow}>
          {allowedOutlets.map((outlet) => {
            const selected = outlet.id === activeOutletId;
            return (
              <Pressable
                key={outlet.id}
                onPress={() => {
                  setActiveOutletId(outlet.id);
                }}
                style={[styles.outletChip, selected ? styles.outletChipActive : null]}
              >
                <Text style={[styles.outletChipText, selected ? styles.outletChipTextActive : null]}>{outlet.code}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.filterRow}>
        <Pressable onPress={() => setShowInactive((value) => !value)} style={[styles.toggleChip, showInactive ? styles.toggleChipActive : null]}>
          <Text style={[styles.toggleChipText, showInactive ? styles.toggleChipTextActive : null]}>
            {showInactive ? "Semua Status" : "Hanya Aktif"}
          </Text>
        </Pressable>
        <AppButton
          leftElement={<Ionicons color={theme.colors.textPrimary} name="refresh-outline" size={17} />}
          onPress={() => void loadZones(true, true)}
          title="Refresh"
          variant="ghost"
        />
      </View>

      {loading ? (
        renderSkeletonList()
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={zones}
          keyExtractor={(item) => item.id}
          onRefresh={() => void loadZones(true, true)}
          refreshing={refreshing}
          renderItem={renderItem}
          ListEmptyComponent={<Text style={styles.emptyText}>Belum ada zona antar untuk outlet ini.</Text>}
          scrollEnabled={false}
        />
      )}

      <AppPanel style={styles.formPanel}>
        <Text style={styles.formTitle}>Tambah Zona Antar</Text>
        <TextInput
          onChangeText={setName}
          placeholder="Nama zona (contoh: Zona 1)"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          value={name}
        />
        <TextInput
          keyboardType="numeric"
          onChangeText={setFeeAmount}
          placeholder="Biaya antar (angka, contoh 10000)"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          value={feeAmount}
        />
        <View style={styles.doubleInputRow}>
          <TextInput
            keyboardType="numeric"
            onChangeText={setMinDistanceKm}
            placeholder="Min km"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.doubleInput]}
            value={minDistanceKm}
          />
          <TextInput
            keyboardType="numeric"
            onChangeText={setMaxDistanceKm}
            placeholder="Max km"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.doubleInput]}
            value={maxDistanceKm}
          />
        </View>
        <TextInput
          keyboardType="numeric"
          onChangeText={setEtaMinutes}
          placeholder="ETA menit (opsional)"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          value={etaMinutes}
        />
        <TextInput
          multiline
          onChangeText={setNotes}
          placeholder="Catatan (opsional)"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, styles.notesInput]}
          value={notes}
        />
        <View style={styles.formActions}>
          <AppButton
            disabled={saving}
            leftElement={<Ionicons color={theme.colors.primaryContrast} name="save-outline" size={17} />}
            loading={saving}
            onPress={() => void handleCreateZone()}
            title="Simpan Zona"
          />
          <AppButton
            leftElement={<Ionicons color={theme.colors.textPrimary} name="refresh-outline" size={17} />}
            onPress={resetForm}
            title="Reset Form"
            variant="ghost"
          />
        </View>
      </AppPanel>

      {actionMessage ? (
        <View style={styles.successWrap}>
          <Ionicons color={theme.colors.success} name="checkmark-circle-outline" size={16} />
          <Text style={styles.successText}>{actionMessage}</Text>
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
    outletChipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    outletChip: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: theme.colors.surface,
    },
    outletChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    outletChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
    },
    outletChipTextActive: {
      color: theme.colors.info,
    },
    filterRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    toggleChip: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: theme.colors.surface,
    },
    toggleChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    toggleChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
    },
    toggleChipTextActive: {
      color: theme.colors.info,
    },
    skeletonWrap: {
      gap: theme.spacing.xs,
      paddingVertical: 2,
    },
    skeletonCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 11,
      gap: 7,
    },
    listContent: {
      gap: theme.spacing.xs,
    },
    zoneCard: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 8,
    },
    zoneTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    zoneTitleWrap: {
      flex: 1,
      gap: 1,
    },
    zoneName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: isTablet ? 15 : 14,
    },
    zoneMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    formPanel: {
      gap: theme.spacing.sm,
    },
    formTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: isTablet ? 16 : 15,
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
    doubleInputRow: {
      flexDirection: isTablet || isCompactLandscape ? "row" : "column",
      gap: theme.spacing.xs,
    },
    doubleInput: {
      flex: 1,
    },
    notesInput: {
      minHeight: isTablet ? 84 : 68,
      textAlignVertical: "top",
    },
    formActions: {
      gap: theme.spacing.xs,
    },
    emptyText: {
      textAlign: "center",
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 8,
      marginBottom: 4,
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
