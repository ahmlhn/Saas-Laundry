import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import {
  archiveServiceProcessTag,
  createServiceProcessTag,
  listServiceProcessTags,
  updateServiceProcessTag,
} from "../../features/services/serviceTagApi";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { ServiceProcessTag } from "../../types/service";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";

const PRESET_COLORS = ["#2A7CE2", "#1FA89A", "#DD8C10", "#CE3D52", "#6A5ACD"];

function isValidHex(value: string): boolean {
  return /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(value.trim());
}

export function ProcessTagManagerScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isLandscape = width > height;
  const isTablet = minEdge >= 600;
  const isCompactLandscape = isLandscape && !isTablet;
  const styles = useMemo(() => createStyles(theme, isTablet, isCompactLandscape), [theme, isTablet, isCompactLandscape]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "ProcessTagManager">>();
  const { session } = useSession();
  const roles = session?.roles ?? [];
  const canManage = hasAnyRole(roles, ["owner", "admin"]);

  const [tags, setTags] = useState<ServiceProcessTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [colorInput, setColorInput] = useState("#2A7CE2");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [busyTagId, setBusyTagId] = useState<string | null>(null);

  const loadTags = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await listServiceProcessTags({ forceRefresh: isRefresh });
      setTags(data);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadTags(true);
    }, [loadTags])
  );

  function resetForm(): void {
    setEditingTagId(null);
    setNameInput("");
    setColorInput("#2A7CE2");
  }

  async function handleSave(): Promise<void> {
    if (!canManage || saving) {
      return;
    }

    const trimmedName = nameInput.trim();
    const trimmedColor = colorInput.trim();

    if (!trimmedName) {
      setErrorMessage("Nama tag proses wajib diisi.");
      return;
    }

    if (!isValidHex(trimmedColor)) {
      setErrorMessage("Format warna harus HEX. Contoh: #2A7CE2");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      if (editingTagId) {
        await updateServiceProcessTag(editingTagId, {
          name: trimmedName,
          colorHex: trimmedColor,
        });
      } else {
        await createServiceProcessTag({
          name: trimmedName,
          colorHex: trimmedColor,
          active: true,
        });
      }

      resetForm();
      await loadTags(true);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(tag: ServiceProcessTag): Promise<void> {
    if (!canManage || busyTagId) {
      return;
    }

    setBusyTagId(tag.id);
    setErrorMessage(null);

    try {
      await archiveServiceProcessTag(tag.id);
      if (editingTagId === tag.id) {
        resetForm();
      }
      await loadTags(true);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setBusyTagId(null);
    }
  }

  function startEdit(tag: ServiceProcessTag): void {
    if (!canManage) {
      return;
    }

    setEditingTagId(tag.id);
    setNameInput(tag.name);
    setColorInput(tag.color_hex || "#2A7CE2");
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <AppPanel style={styles.headerPanel}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}>
            <Ionicons color={theme.colors.textSecondary} name="arrow-back" size={18} />
          </Pressable>
          <Text style={styles.title}>Tag Proses Layanan</Text>
          <View style={styles.spacer} />
        </View>
        <Text style={styles.subtitle}>Kelola tag proses custom seperti Cuci, Kering, atau Setrika.</Text>
      </AppPanel>

      <AppPanel style={styles.formPanel}>
        <Text style={styles.formTitle}>{editingTagId ? "Edit Tag" : "Tambah Tag Baru"}</Text>
        <TextInput
          editable={canManage && !saving}
          onChangeText={setNameInput}
          placeholder="Nama tag proses"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          value={nameInput}
        />
        <TextInput
          autoCapitalize="characters"
          editable={canManage && !saving}
          onChangeText={setColorInput}
          placeholder="#2A7CE2"
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          value={colorInput}
        />
        <View style={styles.colorPreviewRow}>
          {PRESET_COLORS.map((color) => (
            <Pressable key={color} onPress={() => setColorInput(color)} style={[styles.presetColor, { backgroundColor: color }]} />
          ))}
          <View style={[styles.activeColorPreview, { backgroundColor: isValidHex(colorInput) ? colorInput : theme.colors.borderStrong }]} />
        </View>

        <View style={styles.formActionRow}>
          <View style={styles.formActionItem}>
            <AppButton disabled={!canManage || saving} loading={saving} onPress={() => void handleSave()} title={editingTagId ? "Simpan Tag" : "Tambah Tag"} />
          </View>
          {editingTagId ? (
            <View style={styles.formActionItem}>
              <AppButton disabled={!canManage || saving} onPress={resetForm} title="Batal Edit" variant="ghost" />
            </View>
          ) : null}
        </View>
      </AppPanel>

      {errorMessage ? (
        <View style={styles.errorWrap}>
          <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={16} />
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      <AppPanel style={styles.listPanel}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>Daftar Tag</Text>
          <Text style={styles.listCount}>{tags.length} tag</Text>
        </View>

        <FlatList
          data={tags}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={loading ? <Text style={styles.emptyText}>Memuat tag proses...</Text> : <Text style={styles.emptyText}>Belum ada tag proses.</Text>}
          onRefresh={() => void loadTags(true)}
          refreshing={refreshing}
          renderItem={({ item }) => (
            <View style={styles.listItem}>
              <View style={[styles.listItemColor, { backgroundColor: item.color_hex }]} />
              <View style={styles.listItemTextWrap}>
                <Text style={styles.listItemTitle}>{item.name}</Text>
                <Text style={styles.listItemMeta}>#{item.sort_order}</Text>
              </View>
              {canManage ? (
                <View style={styles.listItemActions}>
                  <Pressable onPress={() => startEdit(item)} style={styles.actionIconButton}>
                    <Ionicons color={theme.colors.info} name="create-outline" size={18} />
                  </Pressable>
                  <Pressable disabled={busyTagId === item.id} onPress={() => void handleArchive(item)} style={styles.actionIconButton}>
                    <Ionicons color={theme.colors.danger} name="trash-outline" size={18} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
          scrollEnabled={false}
        />
      </AppPanel>
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
      fontSize: isTablet ? 24 : 22,
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
    formTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 14,
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
    colorPreviewRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    presetColor: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    activeColorPreview: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      marginLeft: 6,
    },
    formActionRow: {
      flexDirection: isTablet || isCompactLandscape ? "row" : "column",
      alignItems: "stretch",
      gap: theme.spacing.xs,
    },
    formActionItem: {
      flex: isTablet || isCompactLandscape ? 1 : undefined,
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
    listPanel: {
      gap: theme.spacing.xs,
    },
    listHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    listTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 14,
    },
    listCount: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    emptyText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      textAlign: "center",
      paddingVertical: 12,
    },
    listItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginBottom: 8,
      backgroundColor: theme.colors.surfaceSoft,
    },
    listItemColor: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    listItemTextWrap: {
      flex: 1,
      gap: 1,
    },
    listItemTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    listItemMeta: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 11,
    },
    listItemActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    actionIconButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surface,
    },
  });
}
