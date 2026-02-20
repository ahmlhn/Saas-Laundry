import type { NavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { AppPanel } from "../../components/ui/AppPanel";
import { AppSkeletonBlock } from "../../components/ui/AppSkeletonBlock";
import { createOrder } from "../../features/orders/orderApi";
import { listServices } from "../../features/services/serviceApi";
import { hasAnyRole } from "../../lib/accessControl";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AppTabParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import type { AppTheme } from "../../theme/useAppTheme";
import { useAppTheme } from "../../theme/useAppTheme";
import type { ServiceCatalogItem } from "../../types/service";

interface DraftOrderItem {
  id: string;
  serviceId: string | null;
  metricInput: string;
}

function generateDraftItemId(): string {
  return `item-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function createDraftItem(serviceId: string | null): DraftOrderItem {
  return {
    id: generateDraftItemId(),
    serviceId,
    metricInput: "",
  };
}

export function QuickActionScreen() {
  const theme = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const navigation = useNavigation<NavigationProp<AppTabParamList>>();
  const { session, selectedOutlet, refreshSession } = useSession();
  const roles = session?.roles ?? [];
  const canCreateOrder = hasAnyRole(roles, ["owner", "admin", "cashier"]);
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftOrderItem[]>([createDraftItem(null)]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [lastCreatedOrderId, setLastCreatedOrderId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedOutlet || !canCreateOrder) {
      setServices([]);
      setDraftItems([createDraftItem(null)]);
      setLoadingServices(false);
      return;
    }

    void loadServices(true);
  }, [selectedOutlet?.id, canCreateOrder]);

  async function loadServices(forceRefresh = false): Promise<void> {
    if (!selectedOutlet) {
      setLoadingServices(false);
      return;
    }

    setLoadingServices(true);
    setErrorMessage(null);

    try {
      const data = await listServices({
        outletId: selectedOutlet.id,
        active: true,
        forceRefresh,
      });
      setServices(data);
      setDraftItems((previous) => {
        const fallbackServiceId = data[0]?.id ?? null;

        if (previous.length === 0) {
          return [createDraftItem(fallbackServiceId)];
        }

        return previous.map((item) => {
          if (item.serviceId && data.some((service) => service.id === item.serviceId)) {
            return item;
          }

          return {
            ...item,
            serviceId: fallbackServiceId,
          };
        });
      });
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setLoadingServices(false);
    }
  }

  function resetCreateForm(): void {
    setCustomerName("");
    setCustomerPhone("");
    setCustomerNotes("");
    setOrderNotes("");
    setDraftItems([createDraftItem(services[0]?.id ?? null)]);
  }

  function updateDraftItem(itemId: string, patch: Partial<DraftOrderItem>): void {
    setDraftItems((previous) => previous.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }

  function handleAddItem(): void {
    setDraftItems((previous) => [...previous, createDraftItem(services[0]?.id ?? null)]);
  }

  function handleRemoveItem(itemId: string): void {
    setDraftItems((previous) => {
      if (previous.length <= 1) {
        return previous;
      }

      return previous.filter((item) => item.id !== itemId);
    });
  }

  async function handleCreateOrder(): Promise<void> {
    if (!selectedOutlet || !canCreateOrder || submitting) {
      return;
    }

    const name = customerName.trim();
    const phone = customerPhone.trim();

    if (!name || !phone) {
      setErrorMessage("Nama pelanggan dan nomor HP wajib diisi.");
      return;
    }

    if (draftItems.length === 0) {
      setErrorMessage("Minimal satu item layanan wajib diisi.");
      return;
    }

    const normalizedItems: Array<{ serviceId: string; qty?: number; weightKg?: number }> = [];

    for (let index = 0; index < draftItems.length; index += 1) {
      const item = draftItems[index];
      const selectedService = services.find((service) => service.id === item.serviceId);

      if (!selectedService) {
        setErrorMessage(`Item ${index + 1}: layanan wajib dipilih.`);
        return;
      }

      const metricValue = Number.parseFloat(item.metricInput.trim());
      if (!Number.isFinite(metricValue) || metricValue <= 0) {
        setErrorMessage(selectedService.unit_type === "kg" ? `Item ${index + 1}: berat (kg) harus lebih dari 0.` : `Item ${index + 1}: qty harus lebih dari 0.`);
        return;
      }

      normalizedItems.push({
        serviceId: selectedService.id,
        qty: selectedService.unit_type === "pcs" ? metricValue : undefined,
        weightKg: selectedService.unit_type === "kg" ? metricValue : undefined,
      });
    }

    setSubmitting(true);
    setErrorMessage(null);
    setActionMessage(null);

    try {
      const created = await createOrder({
        outletId: selectedOutlet.id,
        customer: {
          name,
          phone,
          notes: customerNotes,
        },
        items: normalizedItems,
        notes: orderNotes,
      });

      await refreshSession();
      setLastCreatedOrderId(created.id);
      setActionMessage(`Order ${created.order_code} berhasil dibuat.`);
      resetCreateForm();
      setShowCreateForm(false);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  function renderItemDraft(item: DraftOrderItem, index: number) {
    const selectedService = services.find((service) => service.id === item.serviceId) ?? null;

    return (
      <View key={item.id} style={styles.itemPanel}>
        <View style={styles.itemHeader}>
          <Text style={styles.inputLabel}>Item {index + 1}</Text>
          {draftItems.length > 1 ? (
            <AppButton
              onPress={() => handleRemoveItem(item.id)}
              title="Hapus"
              variant="ghost"
            />
          ) : null}
        </View>
        <View style={styles.serviceList}>
          {services.map((service) => {
            const selected = service.id === item.serviceId;

            return (
              <Pressable
                key={`${item.id}-${service.id}`}
                onPress={() => updateDraftItem(item.id, { serviceId: service.id, metricInput: "" })}
                style={[styles.serviceChip, selected ? styles.serviceChipActive : null]}
              >
                <Text style={[styles.serviceChipText, selected ? styles.serviceChipTextActive : null]}>
                  {service.name} ({service.unit_type.toUpperCase()})
                </Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          keyboardType="numeric"
          onChangeText={(value) => updateDraftItem(item.id, { metricInput: value })}
          placeholder={selectedService?.unit_type === "kg" ? "Berat (kg), contoh 2.5" : "Qty, contoh 3"}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          value={item.metricInput}
        />
      </View>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.content} scroll>
      <View style={styles.header}>
        <Text style={styles.title}>Quick Action</Text>
        <Text style={styles.subtitle}>{selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Outlet belum dipilih"}</Text>
      </View>

      <AppPanel style={styles.panel}>
        <Text style={styles.sectionTitle}>Aksi Cepat Operasional</Text>
        <View style={styles.actionList}>
          <AppButton disabled={!canCreateOrder || loadingServices || services.length === 0} onPress={() => setShowCreateForm((value) => !value)} title={showCreateForm ? "Tutup Form Order" : "Buat Order Baru"} />
          <AppButton
            onPress={() =>
              navigation.navigate("AccountTab", {
                screen: "Customers",
              })
            }
            title="Tambah Pelanggan"
            variant="secondary"
          />
          <AppButton disabled onPress={() => undefined} title="Scan Nota / Barcode (Soon)" variant="secondary" />
        </View>
        {!canCreateOrder ? <Text style={styles.infoText}>Role Anda tidak memiliki akses membuat order.</Text> : null}
        {loadingServices ? (
          <View style={styles.skeletonWrap}>
            <AppSkeletonBlock height={11} width="44%" />
            <AppSkeletonBlock height={11} width="71%" />
          </View>
        ) : null}
        {!loadingServices && canCreateOrder && services.length === 0 ? (
          <Text style={styles.infoText}>Belum ada layanan aktif untuk outlet ini. Aktifkan layanan dulu di menu Akun.</Text>
        ) : null}
      </AppPanel>

      {showCreateForm && canCreateOrder ? (
        <AppPanel style={styles.formPanel}>
          <Text style={styles.formTitle}>Form Order Minimal</Text>
          <TextInput
            onChangeText={setCustomerName}
            placeholder="Nama pelanggan"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={customerName}
          />
          <TextInput
            keyboardType="phone-pad"
            onChangeText={setCustomerPhone}
            placeholder="Nomor HP pelanggan"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={customerPhone}
          />
          <TextInput
            multiline
            onChangeText={setCustomerNotes}
            placeholder="Catatan pelanggan (opsional)"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.notesInput]}
            value={customerNotes}
          />

          <View style={styles.serviceWrap}>
            <Text style={styles.inputLabel}>Item Layanan</Text>
            <View style={styles.itemList}>{draftItems.map((item, index) => renderItemDraft(item, index))}</View>
            <AppButton
              disabled={services.length === 0}
              onPress={handleAddItem}
              title="Tambah Item"
              variant="secondary"
            />
          </View>
          <TextInput
            multiline
            onChangeText={setOrderNotes}
            placeholder="Catatan order (opsional)"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.notesInput]}
            value={orderNotes}
          />

          <View style={styles.formActions}>
            <AppButton disabled={submitting || services.length === 0} loading={submitting} onPress={() => void handleCreateOrder()} title="Simpan Order" />
            <AppButton
              onPress={() => {
                resetCreateForm();
                setShowCreateForm(false);
              }}
              title="Batal"
              variant="ghost"
            />
          </View>
        </AppPanel>
      ) : null}

      {lastCreatedOrderId ? (
        <AppPanel style={styles.followupPanel}>
          <Text style={styles.sectionTitle}>Order Terakhir</Text>
          <View style={styles.actionList}>
            <AppButton
              onPress={() =>
                navigation.navigate("OrdersTab", {
                  screen: "OrderDetail",
                  params: { orderId: lastCreatedOrderId },
                })
              }
              title="Lihat Detail Order"
              variant="secondary"
            />
            <AppButton
              onPress={() =>
                navigation.navigate("OrdersTab", {
                  screen: "OrdersToday",
                })
              }
              title="Buka Daftar Pesanan"
              variant="ghost"
            />
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
      paddingTop: theme.spacing.lg,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
    },
    header: {
      gap: 3,
    },
    title: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.heavy,
      fontSize: 28,
      lineHeight: 34,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 13,
      lineHeight: 19,
    },
    panel: {
      gap: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 16,
    },
    actionList: {
      gap: theme.spacing.xs,
    },
    skeletonWrap: {
      gap: 6,
      marginTop: 4,
    },
    formPanel: {
      gap: theme.spacing.sm,
    },
    formTitle: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 15,
    },
    inputLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
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
      minHeight: 68,
      textAlignVertical: "top",
    },
    serviceWrap: {
      gap: 7,
    },
    itemList: {
      gap: theme.spacing.xs,
    },
    itemPanel: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 10,
      gap: theme.spacing.xs,
    },
    itemHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.xs,
    },
    serviceList: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: theme.spacing.xs,
    },
    serviceChip: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    serviceChipActive: {
      borderColor: theme.colors.info,
      backgroundColor: theme.colors.primarySoft,
    },
    serviceChipText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    serviceChipTextActive: {
      color: theme.colors.info,
    },
    formActions: {
      gap: theme.spacing.xs,
    },
    followupPanel: {
      gap: theme.spacing.xs,
    },
    infoText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 18,
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
