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

type DraftMetricDirection = -1 | 1;

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

function isKgUnit(unitType: string | undefined): boolean {
  return unitType === "kg";
}

function parseMetricInput(raw: string): number {
  const normalized = raw.trim().replace(",", ".");
  return Number.parseFloat(normalized);
}

function getMetricStep(unitType: string | undefined): number {
  return isKgUnit(unitType) ? 0.1 : 1;
}

function normalizeMetricValue(value: number, unitType: string | undefined): number {
  if (isKgUnit(unitType)) {
    return Math.round(value * 10) / 10;
  }

  return Math.round(value);
}

function formatMetricInputValue(value: number, unitType: string | undefined): string {
  const normalizedValue = normalizeMetricValue(value, unitType);

  if (isKgUnit(unitType)) {
    const fixed = normalizedValue.toFixed(1);
    return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
  }

  return `${normalizedValue}`;
}

const currencyFormatter = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `Rp ${currencyFormatter.format(value)}`;
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
  const [shippingFeeInput, setShippingFeeInput] = useState("");
  const [discountInput, setDiscountInput] = useState("");
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
    setShippingFeeInput("");
    setDiscountInput("");
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

  function handleMoveItem(itemId: string, direction: "up" | "down"): void {
    setDraftItems((previous) => {
      const currentIndex = previous.findIndex((item) => item.id === itemId);
      if (currentIndex < 0) {
        return previous;
      }

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= previous.length) {
        return previous;
      }

      const nextItems = [...previous];
      const [movedItem] = nextItems.splice(currentIndex, 1);
      nextItems.splice(targetIndex, 0, movedItem);
      return nextItems;
    });
  }

  function handleStepMetric(itemId: string, direction: DraftMetricDirection): void {
    const item = draftItems.find((draft) => draft.id === itemId);
    if (!item) {
      return;
    }

    const selectedService = services.find((service) => service.id === item.serviceId);
    if (!selectedService) {
      return;
    }

    const currentValue = parseMetricInput(item.metricInput);
    const safeValue = Number.isFinite(currentValue) ? currentValue : 0;
    const step = getMetricStep(selectedService.unit_type);
    const nextValue = Math.max(normalizeMetricValue(safeValue + direction * step, selectedService.unit_type), 0);

    updateDraftItem(item.id, {
      metricInput: nextValue > 0 ? formatMetricInputValue(nextValue, selectedService.unit_type) : "",
    });
  }

  const itemPricingPreview = useMemo(() => {
    return draftItems.map((item, index) => {
      const selectedService = services.find((service) => service.id === item.serviceId) ?? null;
      const metricValue = parseMetricInput(item.metricInput);
      const hasValidMetric = Number.isFinite(metricValue) && metricValue > 0;
      const unitPrice = selectedService?.effective_price_amount ?? 0;
      const lineSubtotal = selectedService && hasValidMetric ? Math.round(metricValue * unitPrice) : 0;

      return {
        id: item.id,
        label: `Item ${index + 1}`,
        service: selectedService,
        metricValue,
        hasValidMetric,
        unitPrice,
        lineSubtotal,
      };
    });
  }, [draftItems, services]);

  const estimatedSubtotal = useMemo(() => itemPricingPreview.reduce((total, item) => total + item.lineSubtotal, 0), [itemPricingPreview]);
  const parsedShippingFee = useMemo(() => {
    const parsed = Number.parseInt(shippingFeeInput.trim(), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }, [shippingFeeInput]);
  const parsedDiscount = useMemo(() => {
    const parsed = Number.parseInt(discountInput.trim(), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }, [discountInput]);
  const estimatedTotal = useMemo(() => Math.max(estimatedSubtotal + parsedShippingFee - parsedDiscount, 0), [estimatedSubtotal, parsedShippingFee, parsedDiscount]);

  async function handleCreateOrder(): Promise<void> {
    if (!selectedOutlet || !canCreateOrder || submitting) {
      return;
    }

    const name = customerName.trim();
    const phone = customerPhone.trim();
    const parsedShipping = shippingFeeInput.trim() ? Number.parseInt(shippingFeeInput.trim(), 10) : 0;
    const parsedDiscountAmount = discountInput.trim() ? Number.parseInt(discountInput.trim(), 10) : 0;

    if (!name || !phone) {
      setErrorMessage("Nama pelanggan dan nomor HP wajib diisi.");
      return;
    }

    if (draftItems.length === 0) {
      setErrorMessage("Minimal satu item layanan wajib diisi.");
      return;
    }

    if (!Number.isFinite(parsedShipping) || parsedShipping < 0) {
      setErrorMessage("Ongkir harus berupa angka >= 0.");
      return;
    }

    if (!Number.isFinite(parsedDiscountAmount) || parsedDiscountAmount < 0) {
      setErrorMessage("Diskon harus berupa angka >= 0.");
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

      const metricValue = parseMetricInput(item.metricInput);
      if (!Number.isFinite(metricValue) || metricValue <= 0) {
        setErrorMessage(isKgUnit(selectedService.unit_type) ? `Item ${index + 1}: berat (kg) harus lebih dari 0.` : `Item ${index + 1}: qty harus lebih dari 0.`);
        return;
      }

      normalizedItems.push({
        serviceId: selectedService.id,
        qty: isKgUnit(selectedService.unit_type) ? undefined : metricValue,
        weightKg: isKgUnit(selectedService.unit_type) ? metricValue : undefined,
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
        shippingFeeAmount: parsedShipping,
        discountAmount: parsedDiscountAmount,
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
    const metricValue = parseMetricInput(item.metricInput);
    const hasValidMetric = Number.isFinite(metricValue) && metricValue > 0;
    const unitPrice = selectedService?.effective_price_amount ?? 0;
    const lineSubtotal = selectedService && hasValidMetric ? Math.round(metricValue * unitPrice) : 0;
    const canMoveUp = index > 0;
    const canMoveDown = index < draftItems.length - 1;
    const metricLabel = isKgUnit(selectedService?.unit_type) ? "Berat (kg)" : "Qty";
    const stepInfo = isKgUnit(selectedService?.unit_type) ? "Step 0.1" : "Step 1";

    return (
      <View key={item.id} style={styles.itemPanel}>
        <View style={styles.itemHeader}>
          <Text style={styles.inputLabel}>Item {index + 1}</Text>
          <View style={styles.itemHeaderActions}>
            <Pressable
              disabled={!canMoveUp}
              onPress={() => handleMoveItem(item.id, "up")}
              style={({ pressed }) => [
                styles.headerActionButton,
                !canMoveUp ? styles.headerActionButtonDisabled : null,
                canMoveUp && pressed ? styles.headerActionButtonPressed : null,
              ]}
            >
              <Text style={[styles.headerActionText, !canMoveUp ? styles.headerActionTextDisabled : null]}>Naik</Text>
            </Pressable>
            <Pressable
              disabled={!canMoveDown}
              onPress={() => handleMoveItem(item.id, "down")}
              style={({ pressed }) => [
                styles.headerActionButton,
                !canMoveDown ? styles.headerActionButtonDisabled : null,
                canMoveDown && pressed ? styles.headerActionButtonPressed : null,
              ]}
            >
              <Text style={[styles.headerActionText, !canMoveDown ? styles.headerActionTextDisabled : null]}>Turun</Text>
            </Pressable>
            {draftItems.length > 1 ? (
              <Pressable
                onPress={() => handleRemoveItem(item.id)}
                style={({ pressed }) => [styles.headerActionButton, pressed ? styles.headerActionButtonPressed : null]}
              >
                <Text style={styles.headerActionDangerText}>Hapus</Text>
              </Pressable>
            ) : null}
          </View>
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
        {selectedService ? (
          <View style={styles.metricStepperWrap}>
            <Text style={styles.inputLabel}>
              Stepper {metricLabel} ({stepInfo})
            </Text>
            <View style={styles.metricStepperRow}>
              <Pressable
                onPress={() => handleStepMetric(item.id, -1)}
                style={({ pressed }) => [styles.metricStepperButton, pressed ? styles.metricStepperButtonPressed : null]}
              >
                <Text style={styles.metricStepperButtonText}>-</Text>
              </Pressable>
              <Text style={styles.metricStepperValue}>{item.metricInput.trim() || "0"}</Text>
              <Pressable
                onPress={() => handleStepMetric(item.id, 1)}
                style={({ pressed }) => [styles.metricStepperButton, pressed ? styles.metricStepperButtonPressed : null]}
              >
                <Text style={styles.metricStepperButtonText}>+</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <TextInput
          keyboardType="numeric"
          onChangeText={(value) => updateDraftItem(item.id, { metricInput: value })}
          placeholder={isKgUnit(selectedService?.unit_type) ? "Berat (kg), contoh 2.5" : "Qty, contoh 3"}
          placeholderTextColor={theme.colors.textMuted}
          style={styles.input}
          value={item.metricInput}
        />
        {selectedService ? (
          <View style={styles.itemPriceInfo}>
            <Text style={styles.itemPriceText}>
              Harga satuan: {formatMoney(unitPrice)} / {selectedService.unit_type.toUpperCase()}
            </Text>
            <Text style={styles.itemPriceText}>
              Subtotal item: {formatMoney(lineSubtotal)}
            </Text>
          </View>
        ) : null}
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
            keyboardType="numeric"
            onChangeText={setShippingFeeInput}
            placeholder="Ongkir (opsional, angka)"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={shippingFeeInput}
          />
          <TextInput
            keyboardType="numeric"
            onChangeText={setDiscountInput}
            placeholder="Diskon (opsional, angka)"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
            value={discountInput}
          />
          <TextInput
            multiline
            onChangeText={setOrderNotes}
            placeholder="Catatan order (opsional)"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.notesInput]}
            value={orderNotes}
          />

          <AppPanel style={styles.summaryPanel}>
            <Text style={styles.formTitle}>Ringkasan Estimasi</Text>
            {itemPricingPreview.map((item) => (
              <View key={`summary-${item.id}`} style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  {item.label} - {item.service ? item.service.name : "Pilih layanan"}
                </Text>
                <Text style={styles.summaryValue}>{formatMoney(item.lineSubtotal)}</Text>
              </View>
            ))}
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatMoney(estimatedSubtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Ongkir</Text>
              <Text style={styles.summaryValue}>{formatMoney(parsedShippingFee)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Diskon</Text>
              <Text style={styles.summaryValue}>- {formatMoney(parsedDiscount)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryTotalLabel}>Estimasi Total</Text>
              <Text style={styles.summaryTotalValue}>{formatMoney(estimatedTotal)}</Text>
            </View>
          </AppPanel>

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
    itemHeaderActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "flex-end",
      gap: 4,
    },
    headerActionButton: {
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    headerActionButtonDisabled: {
      opacity: 0.52,
    },
    headerActionButtonPressed: {
      opacity: 0.78,
    },
    headerActionText: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      letterSpacing: 0.15,
    },
    headerActionTextDisabled: {
      color: theme.colors.textMuted,
    },
    headerActionDangerText: {
      color: theme.colors.danger,
      fontFamily: theme.fonts.semibold,
      fontSize: 11,
      letterSpacing: 0.15,
    },
    metricStepperWrap: {
      gap: 5,
    },
    metricStepperRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
    },
    metricStepperButton: {
      width: 32,
      height: 32,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.sm,
      backgroundColor: theme.colors.surfaceSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    metricStepperButtonPressed: {
      opacity: 0.78,
    },
    metricStepperButtonText: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 16,
      lineHeight: 19,
    },
    metricStepperValue: {
      minWidth: 42,
      textAlign: "center",
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 13,
    },
    itemPriceInfo: {
      gap: 2,
    },
    itemPriceText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
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
    summaryPanel: {
      gap: 6,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.colors.surfaceSoft,
    },
    summaryRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    summaryLabel: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.medium,
      fontSize: 12,
      lineHeight: 17,
    },
    summaryValue: {
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.semibold,
      fontSize: 12,
    },
    summaryDivider: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginVertical: 2,
    },
    summaryTotalLabel: {
      flex: 1,
      color: theme.colors.textPrimary,
      fontFamily: theme.fonts.bold,
      fontSize: 13,
    },
    summaryTotalValue: {
      color: theme.colors.info,
      fontFamily: theme.fonts.heavy,
      fontSize: 14,
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
