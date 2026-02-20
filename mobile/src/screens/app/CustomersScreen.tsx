import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { StatusPill } from "../../components/ui/StatusPill";
import { archiveCustomer, createCustomer, listCustomers, restoreCustomer, updateCustomer } from "../../features/customers/customerApi";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AccountStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { Customer } from "../../types/customer";

function hasAnyRole(roles: string[], allowed: string[]): boolean {
  return roles.some((role) => allowed.includes(role));
}

export function CustomersScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<NativeStackNavigationProp<AccountStackParamList, "Customers">>();
  const { session } = useSession();
  const roles = session?.roles ?? [];
  const canCreateOrEdit = hasAnyRole(roles, ["owner", "admin", "cashier"]);
  const canArchive = hasAnyRole(roles, ["owner", "admin"]);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formNotes, setFormNotes] = useState("");

  useEffect(() => {
    void loadCustomers(false);
  }, [includeDeleted]);

  async function loadCustomers(isRefresh: boolean): Promise<void> {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage(null);

    try {
      const data = await listCustomers({
        query: search,
        limit: 60,
        includeDeleted: includeDeleted && canArchive ? true : undefined,
      });
      setCustomers(data);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }

  function resetForm(): void {
    setEditingCustomerId(null);
    setFormName("");
    setFormPhone("");
    setFormNotes("");
  }

  async function handleSubmit(): Promise<void> {
    if (!canCreateOrEdit || saving) {
      return;
    }

    const name = formName.trim();
    const phone = formPhone.trim();

    if (!name || !phone) {
      setErrorMessage("Nama dan nomor HP wajib diisi.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      if (editingCustomerId) {
        await updateCustomer(editingCustomerId, {
          name,
          phone,
          notes: formNotes,
        });
        setActionMessage("Pelanggan berhasil diperbarui.");
      } else {
        await createCustomer({
          name,
          phone,
          notes: formNotes,
        });
        setActionMessage("Pelanggan berhasil ditambahkan.");
      }
      resetForm();
      await loadCustomers(false);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleArchive(item: Customer): Promise<void> {
    if (!canArchive) {
      return;
    }

    setErrorMessage(null);
    setActionMessage(null);

    try {
      if (item.deleted_at) {
        await restoreCustomer(item.id);
        setActionMessage("Pelanggan berhasil dipulihkan.");
      } else {
        await archiveCustomer(item.id);
        setActionMessage("Pelanggan berhasil diarsipkan.");
      }
      await loadCustomers(false);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    }
  }

  const filteredCustomers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return customers;
    }

    return customers.filter((customer) => {
      const values = [customer.name, customer.phone_normalized, customer.notes]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase());
      return values.some((value) => value.includes(keyword));
    });
  }, [customers, search]);

  function startEdit(item: Customer): void {
    if (!canCreateOrEdit) {
      return;
    }
    setEditingCustomerId(item.id);
    setFormName(item.name);
    setFormPhone(item.phone_normalized);
    setFormNotes(item.notes ?? "");
  }

  function renderItem({ item }: { item: Customer }) {
    return (
      <Pressable onPress={() => startEdit(item)} style={styles.customerCard}>
        <View style={styles.customerTop}>
          <View style={styles.customerTitleWrap}>
            <Text style={styles.customerName}>{item.name}</Text>
            <Text style={styles.customerPhone}>{item.phone_normalized}</Text>
          </View>
          <StatusPill label={item.deleted_at ? "Arsip" : "Aktif"} tone={item.deleted_at ? "warning" : "success"} />
        </View>

        {item.notes ? <Text style={styles.customerNotes}>{item.notes}</Text> : null}

        <View style={styles.customerActions}>
          {canCreateOrEdit ? <AppButton onPress={() => startEdit(item)} title="Edit" variant="secondary" /> : null}
          {canArchive ? (
            <AppButton onPress={() => void handleToggleArchive(item)} title={item.deleted_at ? "Restore" : "Arsipkan"} variant="ghost" />
          ) : null}
        </View>
      </Pressable>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Kembali</Text>
        </Pressable>
        <Text style={styles.title}>Pelanggan</Text>
        <Text style={styles.subtitle}>Kelola data pelanggan tenant secara cepat dari mobile.</Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          onChangeText={setSearch}
          placeholder="Cari nama / nomor HP..."
          placeholderTextColor={theme.colors.textMuted}
          style={styles.searchInput}
          value={search}
        />
        <AppButton onPress={() => void loadCustomers(false)} title="Cari" variant="secondary" />
      </View>

      {canArchive ? (
        <Pressable onPress={() => setIncludeDeleted((value) => !value)} style={[styles.toggleChip, includeDeleted ? styles.toggleChipActive : null]}>
          <Text style={[styles.toggleChipText, includeDeleted ? styles.toggleChipTextActive : null]}>
            {includeDeleted ? "Menampilkan Arsip" : "Sembunyikan Arsip"}
          </Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.primaryStrong} />
          <Text style={styles.loadingText}>Memuat pelanggan...</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.listContent}
          data={filteredCustomers}
          keyExtractor={(item) => item.id}
          onRefresh={() => void loadCustomers(true)}
          refreshing={refreshing}
          renderItem={renderItem}
          ListEmptyComponent={<Text style={styles.emptyText}>Belum ada pelanggan untuk filter saat ini.</Text>}
          scrollEnabled={false}
        />
      )}

      {canCreateOrEdit ? (
        <AppPanel style={styles.formPanel}>
          <Text style={styles.formTitle}>{editingCustomerId ? "Edit Pelanggan" : "Tambah Pelanggan"}</Text>
          <TextInput
            onChangeText={setFormName}
            placeholder="Nama pelanggan"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={formName}
          />
          <TextInput
            keyboardType="phone-pad"
            onChangeText={setFormPhone}
            placeholder="Nomor HP (contoh 0812...)"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={formPhone}
          />
          <TextInput
            multiline
            onChangeText={setFormNotes}
            placeholder="Catatan (opsional)"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.notesInput]}
            value={formNotes}
          />
          <View style={styles.formActions}>
            <AppButton disabled={saving} loading={saving} onPress={() => void handleSubmit()} title={editingCustomerId ? "Simpan Perubahan" : "Tambah Pelanggan"} />
            {editingCustomerId ? <AppButton onPress={resetForm} title="Batal Edit" variant="ghost" /> : null}
          </View>
        </AppPanel>
      ) : null}

      {actionMessage ? (
        <View style={styles.successWrap}>
          <Text style={styles.successText}>{actionMessage}</Text>
        </View>
      ) : null}
      {errorMessage ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </AppScreen>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    content: {
      flexGrow: 1,
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.sm,
    },
    header: {
      gap: 2,
    },
    backButton: {
      alignSelf: "flex-start",
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 7,
      marginBottom: 2,
    },
    backButtonText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 27,
      lineHeight: 34,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
    searchRow: {
      flexDirection: "row",
      gap: theme.spacing.xs,
      alignItems: "center",
    },
    searchInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.inputBg,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      paddingHorizontal: 12,
      paddingVertical: 10,
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
      fontSize: 12,
    },
    toggleChipTextActive: {
      color: theme.colors.info,
    },
    centered: {
      paddingVertical: 28,
      alignItems: "center",
      gap: 8,
    },
    loadingText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    listContent: {
      gap: theme.spacing.xs,
    },
    customerCard: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 11,
      gap: 7,
    },
    customerTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
    },
    customerTitleWrap: {
      flex: 1,
      gap: 1,
    },
    customerName: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
    },
    customerPhone: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
    },
    customerNotes: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    customerActions: {
      flexDirection: "row",
      gap: theme.spacing.xs,
    },
    formPanel: {
      gap: theme.spacing.sm,
      marginTop: 2,
    },
    formTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
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
      paddingVertical: 10,
    },
    notesInput: {
      minHeight: 74,
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
      paddingVertical: 9,
    },
    successText: {
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
      paddingVertical: 9,
    },
    errorText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
    },
  });
}
