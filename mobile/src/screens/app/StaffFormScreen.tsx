import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { ServiceModuleHeader } from "../../components/services/ServiceModuleHeader";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { AppSkeletonBlock } from "../../components/ui/AppSkeletonBlock";
import { StatusPill } from "../../components/ui/StatusPill";
import { listOutlets } from "../../features/outlets/outletApi";
import { archiveStaff, createStaff, restoreStaff, updateStaffAssignment } from "../../features/staff/staffApi";
import { buildAssignableStaffRoles, getStaffMainRoleKey, getStaffRoleMeta } from "../../features/staff/staffHelpers";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OutletItem } from "../../types/outlet";
import type { CreateStaffPayload, StaffAssignableRoleKey, StaffLifecycleStatus, StaffMember, UpdateStaffAssignmentPayload } from "../../types/staff";

type StaffFormRoute = RouteProp<AccountStackParamList, "StaffForm">;

const OUTLET_LIMIT = 100;

interface ComposerState {
  name: string;
  email: string;
  phone: string;
  password: string;
  status: StaffLifecycleStatus;
  roleKey: StaffAssignableRoleKey;
  outletIds: string[];
}

function makeCreateComposer(selectedOutletId: string | null, roleKeys: StaffAssignableRoleKey[]): ComposerState {
  return {
    name: "",
    email: "",
    phone: "",
    password: "",
    status: "active",
    roleKey: roleKeys[0] ?? "cashier",
    outletIds: selectedOutletId ? [selectedOutletId] : [],
  };
}

function makeEditComposer(item: StaffMember, roleKeys: StaffAssignableRoleKey[]): ComposerState {
  return {
    name: item.name,
    email: item.email,
    phone: item.phone ?? "",
    password: "",
    status: item.status === "inactive" ? "inactive" : "active",
    roleKey: (getStaffMainRoleKey(item) || roleKeys[0] || "cashier") as StaffAssignableRoleKey,
    outletIds: item.outlets.map((outlet) => outlet.id),
  };
}

function validateComposer(mode: "create" | "edit", form: ComposerState): string | null {
  if (form.name.trim() === "") {
    return "Nama pegawai wajib diisi.";
  }

  if (form.email.trim() === "" || !form.email.includes("@")) {
    return "Email pegawai belum valid.";
  }

  if (mode === "create") {
    if (form.password.trim().length < 8) {
      return "Password minimal 8 karakter.";
    }
  } else if (form.password.trim() !== "" && form.password.trim().length < 8) {
    return "Password baru minimal 8 karakter.";
  }

  if (form.outletIds.length === 0) {
    return "Pilih minimal satu outlet.";
  }

  return null;
}

export function StaffFormScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "StaffForm">>();
  const route = useRoute<StaffFormRoute>();
  const { session, selectedOutlet } = useSession();

  const roles = session?.roles ?? [];
  const canManage = hasAnyRole(roles, ["owner", "admin"]);
  const canArchive = roles.includes("owner");
  const assignableRoleKeys = useMemo(() => buildAssignableStaffRoles(roles), [roles]);
  const isEditMode = route.params.mode === "edit";
  const editingStaff = isEditMode ? route.params.staff ?? null : null;
  const isArchived = Boolean(editingStaff?.deleted_at);
  const isSelf = editingStaff?.id === session?.user.id;
  const canManageLifecycle = Boolean(isEditMode && editingStaff && canArchive && !isSelf);

  const [outlets, setOutlets] = useState<OutletItem[]>([]);
  const [loadingOutlets, setLoadingOutlets] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [form, setForm] = useState<ComposerState>(() =>
    isEditMode && editingStaff ? makeEditComposer(editingStaff, assignableRoleKeys) : makeCreateComposer(selectedOutlet?.id ?? null, assignableRoleKeys)
  );

  useEffect(() => {
    setForm(isEditMode && editingStaff ? makeEditComposer(editingStaff, assignableRoleKeys) : makeCreateComposer(selectedOutlet?.id ?? null, assignableRoleKeys));
  }, [assignableRoleKeys, editingStaff, isEditMode, selectedOutlet?.id]);

  useEffect(() => {
    if (!canManage) {
      setLoadingOutlets(false);
      return;
    }

    let active = true;

    async function loadOutletOptions(): Promise<void> {
      setLoadingOutlets(true);
      try {
        const outletRows = await listOutlets({ limit: OUTLET_LIMIT, forceRefresh: true });
        if (!active) {
          return;
        }
        setOutlets(outletRows);
      } catch (error) {
        if (!active) {
          return;
        }
        setErrorMessage(getApiErrorMessage(error));
      } finally {
        if (active) {
          setLoadingOutlets(false);
        }
      }
    }

    void loadOutletOptions();

    return () => {
      active = false;
    };
  }, [canManage]);

  function updateForm<Key extends keyof ComposerState>(key: Key, value: ComposerState[Key]): void {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleOutlet(outletId: string): void {
    setForm((current) => ({
      ...current,
      outletIds: current.outletIds.includes(outletId) ? current.outletIds.filter((id) => id !== outletId) : [...current.outletIds, outletId],
    }));
  }

  async function handleSave(): Promise<void> {
    if (!canManage || saving || deleting || isArchived) {
      return;
    }

    const validationMessage = validateComposer(route.params.mode, form);
    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    if (isEditMode && !editingStaff) {
      setErrorMessage("Data pegawai tidak ditemukan untuk mode edit.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      if (route.params.mode === "create") {
        const payload: CreateStaffPayload = {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          password: form.password,
          status: form.status,
          role_key: form.roleKey,
          outlet_ids: form.outletIds,
        };
        await createStaff(payload);
      } else if (editingStaff) {
        const payload: UpdateStaffAssignmentPayload = {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          password: form.password.trim() || null,
          status: form.status,
          role_key: form.roleKey,
          outlet_ids: form.outletIds,
        };
        await updateStaffAssignment(editingStaff.id, payload);
      }

      navigation.goBack();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function confirmLifecycleAction(): void {
    if (!editingStaff || !canManageLifecycle || deleting || saving) {
      return;
    }

    const restoring = Boolean(editingStaff.deleted_at);

    Alert.alert(
      restoring ? "Pulihkan Pegawai" : "Hapus Pegawai",
      restoring ? `Pulihkan akses ${editingStaff.name}?` : `Hapus ${editingStaff.name}? Akun pegawai ini akan diarsipkan dari tenant.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: restoring ? "Pulihkan" : "Hapus",
          style: restoring ? "default" : "destructive",
          onPress: () => {
            void handleLifecycleAction();
          },
        },
      ]
    );
  }

  async function handleLifecycleAction(): Promise<void> {
    if (!editingStaff || !canManageLifecycle || deleting || saving) {
      return;
    }

    setDeleting(true);
    setErrorMessage(null);

    try {
      if (editingStaff.deleted_at) {
        await restoreStaff(editingStaff.id);
      } else {
        await archiveStaff(editingStaff.id);
      }

      navigation.goBack();
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setDeleting(false);
    }
  }

  if (!canManage) {
    return (
      <AppScreen contentContainerStyle={styles.content} scroll>
        <ServiceModuleHeader onBack={() => navigation.goBack()} title="Kelola Pegawai">
          <StatusPill label="Akses Ditolak" tone="warning" />
        </ServiceModuleHeader>
        <AppPanel style={styles.panel}>
          <Text style={styles.emptyTitle}>Akun Anda tidak memiliki akses ke form pegawai.</Text>
          <Text style={styles.emptyText}>Kembali ke halaman sebelumnya atau gunakan akun owner/admin.</Text>
        </AppPanel>
      </AppScreen>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
      <AppScreen contentContainerStyle={styles.content} scroll>
        <ServiceModuleHeader onBack={() => navigation.goBack()} title={isEditMode ? "Edit Pegawai" : "Tambah Pegawai"}>
          <View style={styles.headerMetaRow}>
            <StatusPill label={isEditMode ? "Edit Akses" : "Akun Baru"} tone="info" />
            <StatusPill label={isArchived ? "Arsip" : form.status === "active" ? "Aktif" : "Nonaktif"} tone={isArchived ? "warning" : form.status === "active" ? "success" : "warning"} />
          </View>
        </ServiceModuleHeader>

        {isArchived ? (
          <View style={styles.feedbackWarning}>
            <Ionicons color={theme.colors.warning} name="alert-circle-outline" size={16} />
            <Text style={styles.feedbackWarningText}>Pegawai ini sedang diarsipkan. Pulihkan dulu jika ingin mengubah datanya.</Text>
          </View>
        ) : null}

        <AppPanel style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelEyebrow}>{isEditMode ? "Profil" : "Login Baru"}</Text>
            <Text style={styles.panelTitle}>{isEditMode ? "Akun yang sedang diubah" : "Informasi akun pegawai"}</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Nama Pegawai</Text>
            <TextInput
              editable={!saving && !deleting && !isArchived}
              onChangeText={(value) => updateForm("name", value)}
              placeholder="Contoh: Rina Operasional"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={form.name}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email Login</Text>
            <TextInput
              autoCapitalize="none"
              editable={!saving && !deleting && !isArchived}
              keyboardType="email-address"
              onChangeText={(value) => updateForm("email", value)}
              placeholder="pegawai@laundry.local"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={form.email}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>No. HP</Text>
            <TextInput
              editable={!saving && !deleting && !isArchived}
              keyboardType="phone-pad"
              onChangeText={(value) => updateForm("phone", value)}
              placeholder="08xxxxxxxxxx"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={form.phone}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>{isEditMode ? "Password Baru" : "Password Awal"}</Text>
            <TextInput
              editable={!saving && !deleting && !isArchived}
              onChangeText={(value) => updateForm("password", value)}
              placeholder={isEditMode ? "Kosongkan jika tidak diubah" : "Minimal 8 karakter"}
              placeholderTextColor={theme.colors.textMuted}
              secureTextEntry
              style={styles.input}
              value={form.password}
            />
          </View>
        </AppPanel>

        <AppPanel style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelEyebrow}>Akses</Text>
            <Text style={styles.panelTitle}>Status dan role kerja</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Status Akun</Text>
            <View style={styles.selectorWrap}>
              {[
                { key: "active" as const, label: "Aktif" },
                { key: "inactive" as const, label: "Nonaktif" },
              ].map((option) => (
                <Pressable
                  key={option.key}
                  disabled={saving || deleting || isArchived}
                  onPress={() => updateForm("status", option.key)}
                  style={[styles.selector, form.status === option.key ? styles.selectorActive : null]}
                >
                  <Text style={[styles.selectorText, form.status === option.key ? styles.selectorTextActive : null]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Role</Text>
            <View style={styles.roleGrid}>
              {assignableRoleKeys.map((roleKey) => (
                <Pressable
                  key={roleKey}
                  disabled={saving || deleting || isArchived}
                  onPress={() => updateForm("roleKey", roleKey)}
                  style={[styles.roleCard, form.roleKey === roleKey ? styles.roleCardActive : null]}
                >
                  <Ionicons color={form.roleKey === roleKey ? theme.colors.info : theme.colors.textSecondary} name={getStaffRoleMeta(roleKey).icon} size={16} />
                  <Text style={[styles.roleCardTitle, form.roleKey === roleKey ? styles.selectorTextActive : null]}>{getStaffRoleMeta(roleKey).label}</Text>
                  <Text style={styles.roleCardHint}>{getStaffRoleMeta(roleKey).hint}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </AppPanel>

        <AppPanel style={styles.panel}>
          <View style={styles.outletHead}>
            <View style={styles.panelHeaderCompact}>
              <Text style={styles.panelEyebrow}>Outlet</Text>
              <Text style={styles.panelTitle}>Penugasan outlet</Text>
            </View>
            <StatusPill label={`${form.outletIds.length} dipilih`} tone="info" />
          </View>

          {loadingOutlets ? (
            <View style={styles.loadingOutletWrap}>
              {Array.from({ length: 3 }).map((_, index) => (
                <AppSkeletonBlock key={`outlet-skeleton-${index}`} height={54} width="100%" />
              ))}
            </View>
          ) : (
            <View style={styles.outletGrid}>
              {outlets.map((outlet) => (
                <Pressable
                  key={outlet.id}
                  disabled={saving || deleting || isArchived}
                  onPress={() => toggleOutlet(outlet.id)}
                  style={[styles.outletCard, form.outletIds.includes(outlet.id) ? styles.outletCardActive : null]}
                >
                  <Text style={[styles.outletCode, form.outletIds.includes(outlet.id) ? styles.selectorTextActive : null]}>{outlet.code}</Text>
                  <Text numberOfLines={1} style={styles.outletName}>{outlet.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </AppPanel>

        {errorMessage ? (
          <View style={styles.feedbackError}>
            <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
            <Text style={styles.feedbackErrorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {isEditMode && canManageLifecycle ? (
          <AppPanel style={styles.panel}>
            <View style={styles.deleteActionWrap}>
              <AppButton
                disabled={saving || deleting}
                leftElement={<Ionicons color={editingStaff?.deleted_at ? theme.colors.info : theme.colors.danger} name={editingStaff?.deleted_at ? "refresh-outline" : "trash-outline"} size={16} />}
                loading={deleting}
                onPress={confirmLifecycleAction}
                title={editingStaff?.deleted_at ? "Pulihkan Pegawai" : "Hapus Pegawai"}
                variant="ghost"
              />
            </View>
          </AppPanel>
        ) : null}

        <View style={styles.actionRow}>
          <View style={styles.actionItem}>
            <AppButton onPress={() => navigation.goBack()} title="Batal" variant="ghost" />
          </View>
          <View style={styles.actionItem}>
            <AppButton loading={saving} onPress={() => void handleSave()} title={isEditMode ? "Simpan Perubahan" : "Simpan Pegawai"} />
          </View>
        </View>
      </AppScreen>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: AppTheme, isTablet: boolean, isCompactLandscape: boolean) {
  return StyleSheet.create({
    flex: { flex: 1 },
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
      justifyContent: "center",
    },
    panel: {
      gap: theme.spacing.sm,
    },
    panelHeader: {
      gap: 2,
    },
    panelHeaderCompact: {
      gap: 2,
      flex: 1,
    },
    panelEyebrow: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.semibold,
      fontSize: 10.5,
      textTransform: "uppercase",
      letterSpacing: 0.45,
    },
    panelTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 16,
      lineHeight: 21,
    },
    fieldGroup: {
      gap: 8,
    },
    label: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11.5,
    },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    selectorWrap: {
      flexDirection: "row",
      gap: 8,
    },
    selector: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 12,
      paddingVertical: 12,
      alignItems: "center",
    },
    selectorActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    selectorText: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
    },
    selectorTextActive: {
      color: theme.colors.info,
    },
    roleGrid: {
      gap: 8,
    },
    roleCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 12,
      paddingVertical: 11,
      gap: 4,
    },
    roleCardActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    roleCardTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12.5,
    },
    roleCardHint: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    outletHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    loadingOutletWrap: {
      gap: theme.spacing.xs,
    },
    outletGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    outletCard: {
      minWidth: "47%",
      flexGrow: 1,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 3,
    },
    outletCardActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    outletCode: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 12,
    },
    outletName: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11.5,
      lineHeight: 16,
    },
    feedbackError: {
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
    feedbackErrorText: {
      flex: 1,
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    feedbackWarning: {
      borderWidth: 1,
      borderColor: theme.mode === "dark" ? "#6d4a14" : "#f1d08b",
      borderRadius: theme.radii.md,
      backgroundColor: theme.mode === "dark" ? "#3c2b10" : "#fff8ea",
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    feedbackWarningText: {
      flex: 1,
      color: theme.colors.warning,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    deleteActionWrap: {
      width: "100%",
    },
    actionRow: {
      flexDirection: isTablet || isCompactLandscape ? "row" : "column",
      gap: theme.spacing.xs,
      alignItems: "stretch",
    },
    actionItem: {
      flex: 1,
    },
    emptyTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
      textAlign: "center",
    },
    emptyText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
    },
  });
}
