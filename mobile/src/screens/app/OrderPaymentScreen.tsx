import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { extractCustomerPhoneDigits } from "../../features/customers/customerPhone";
import { addOrderPayment, getOrderDetail } from "../../features/orders/orderApi";
import { buildOrderReceiptText, buildOrderWhatsAppMessage } from "../../features/orders/orderReceipt";
import { DEFAULT_PRINTER_LOCAL_SETTINGS, getPrinterLocalSettings } from "../../features/settings/printerLocalSettingsStorage";
import { getApiErrorMessage } from "../../lib/httpClient";
import type { AppRootStackParamList } from "../../navigation/types";
import { useSession } from "../../state/SessionContext";
import { useAppTheme } from "../../theme/useAppTheme";
import type { OrderDetail } from "../../types/order";

type Navigation = NativeStackNavigationProp<AppRootStackParamList, "OrderPayment">;
type PaymentRoute = RouteProp<AppRootStackParamList, "OrderPayment">;
type PaymentMethodType = "cash" | "transfer" | "other";
type Stage = "entry" | "result";

const NOTICE_AUTO_HIDE_MS = 4000;

interface ResultSummary {
  appliedAmount: number;
  tenderedAmount: number;
  changeAmount: number;
  remainingAmount: number;
}

const PAYMENT_METHODS: Array<{ value: PaymentMethodType; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { value: "cash", label: "Tunai", icon: "cash-outline" },
  { value: "transfer", label: "Transfer", icon: "card-outline" },
  { value: "other", label: "Lainnya", icon: "wallet-outline" },
];

const money = new Intl.NumberFormat("id-ID");

function formatMoney(value: number): string {
  return `Rp ${money.format(Math.max(Math.round(value), 0))}`;
}

function normalizeMoneyInput(raw: string): string {
  return raw.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "").slice(0, 9);
}

function parseMoneyInput(raw: string): number {
  const parsed = Number.parseInt(normalizeMoneyInput(raw), 10);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function OrderPaymentScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isTablet = minEdge >= 600;
  const isLandscape = width > height;
  const navigation = useNavigation<Navigation>();
  const route = useRoute<PaymentRoute>();
  const { selectedOutlet } = useSession();
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethodType, setPaymentMethodType] = useState<PaymentMethodType>(route.params.initialMethod ?? "cash");
  const [paymentDigits, setPaymentDigits] = useState("");
  const [stage, setStage] = useState<Stage>("entry");
  const [result, setResult] = useState<ResultSummary | null>(null);
  const styles = useMemo(() => createStyles(theme, isTablet, isLandscape), [theme, isTablet, isLandscape]);
  const isReceiptOnly = route.params.flow === "receipt";
  const canSkipPayment = route.params.source === "create";

  const outletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Outlet belum dipilih";
  const customerPhoneDigits = useMemo(() => extractCustomerPhoneDigits(detail?.customer?.phone_normalized ?? ""), [detail?.customer?.phone_normalized]);
  const dueAmount = Math.max(detail?.due_amount ?? 0, 0);
  const tenderedAmount = useMemo(() => parseMoneyInput(paymentDigits), [paymentDigits]);
  const appliedAmount = useMemo(() => Math.min(tenderedAmount, dueAmount), [tenderedAmount, dueAmount]);
  const changeAmount = useMemo(() => (paymentMethodType === "cash" ? Math.max(tenderedAmount - dueAmount, 0) : 0), [paymentMethodType, tenderedAmount, dueAmount]);
  const paymentMethodLabel = useMemo(() => PAYMENT_METHODS.find((item) => item.value === paymentMethodType)?.label ?? "Tunai", [paymentMethodType]);
  const isReceiptResult = stage === "result" && (isReceiptOnly || (canSkipPayment && (result?.tenderedAmount ?? 0) <= 0 && (result?.appliedAmount ?? 0) <= 0));
  const shouldSkipPaymentEntry = canSkipPayment && (tenderedAmount <= 0 || dueAmount <= 0);
  const resultTitle = isReceiptResult ? "Pesanan Berhasil Disimpan" : (result?.remainingAmount ?? 0) > 0 ? "Pembayaran Tercatat" : "Pembayaran Berhasil";

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    setStage("entry");
    setResult(null);

    void getOrderDetail(route.params.orderId)
      .then((response) => {
        if (!active) {
          return;
        }
        setDetail(response);
        if (isReceiptOnly) {
          setResult({
            appliedAmount: 0,
            tenderedAmount: 0,
            changeAmount: 0,
            remainingAmount: Math.max(response.due_amount, 0),
          });
          setStage("result");
          setNoticeMessage("Pesanan disimpan sebagai bayar nanti. Cetak atau bagikan nota bila diperlukan.");
        }
      })
      .catch((error) => {
        if (active) {
          setErrorMessage(getApiErrorMessage(error));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [isReceiptOnly, route.params.orderId]);

  useEffect(() => {
    if (!detail || stage !== "entry") {
      return;
    }

    const seed = route.params.initialAmount && route.params.initialAmount > 0 ? route.params.initialAmount : 0;
    setPaymentDigits(seed > 0 ? normalizeMoneyInput(`${seed}`) : "");
    setPaymentMethodType(route.params.initialMethod ?? "cash");
  }, [detail?.id, dueAmount, route.params.initialAmount, route.params.initialMethod, stage]);

  useEffect(() => {
    if (!noticeMessage) {
      return;
    }

    const timeout = setTimeout(() => {
      setNoticeMessage(null);
    }, NOTICE_AUTO_HIDE_MS);

    return () => clearTimeout(timeout);
  }, [noticeMessage]);

  async function handleSubmit(): Promise<void> {
    if (!detail || submitting) {
      return;
    }
    if (canSkipPayment && (tenderedAmount <= 0 || dueAmount <= 0)) {
      setErrorMessage(null);
      setNoticeMessage(dueAmount > 0 ? "Pesanan disimpan sebagai bayar nanti. Cetak atau bagikan nota bila diperlukan." : "Pesanan tersimpan tanpa sisa tagihan. Cetak atau bagikan nota bila diperlukan.");
      setResult({
        appliedAmount: 0,
        tenderedAmount: 0,
        changeAmount: 0,
        remainingAmount: dueAmount,
      });
      setStage("result");
      return;
    }
    if (dueAmount <= 0) {
      setErrorMessage("Order ini sudah lunas.");
      return;
    }
    if (tenderedAmount <= 0) {
      setErrorMessage("Masukkan nominal pembayaran terlebih dulu.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      const latest = await addOrderPayment({
        orderId: detail.id,
        amount: appliedAmount,
        method: paymentMethodType,
      });
      const resolved = latest ?? (await getOrderDetail(detail.id));
      setDetail(resolved);
      setResult({
        appliedAmount,
        tenderedAmount,
        changeAmount,
        remainingAmount: Math.max(resolved.due_amount, 0),
      });
      setStage("result");
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleShareReceipt(kind: "customer" | "production"): Promise<void> {
    if (!detail) {
      return;
    }

    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      const printerSettings = await getPrinterLocalSettings(selectedOutlet?.id).catch(() => DEFAULT_PRINTER_LOCAL_SETTINGS);
      await Share.share({
        title: kind === "production" ? "Nota Produksi Laundry" : "Nota Konsumen Laundry",
        message: buildOrderReceiptText({
          kind,
          order: detail,
          outletLabel,
          paperWidth: printerSettings.paperWidth,
        }),
      });
      setNoticeMessage(kind === "production" ? "Nota produksi siap dibagikan atau dicetak." : "Nota konsumen siap dibagikan atau dicetak.");
    } catch {
      setErrorMessage("Gagal membuka menu bagikan nota.");
    }
  }

  async function handleOpenWhatsApp(): Promise<void> {
    if (!detail) {
      return;
    }
    if (!customerPhoneDigits) {
      setErrorMessage("Nomor WhatsApp pelanggan belum valid.");
      return;
    }

    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      const url = `https://wa.me/${customerPhoneDigits}?text=${encodeURIComponent(buildOrderWhatsAppMessage(detail, outletLabel))}`;
      await Linking.openURL(url);
      setNoticeMessage("WhatsApp dibuka. Lanjutkan pengiriman nota dari aplikasi WA.");
    } catch {
      setErrorMessage("Gagal membuka WhatsApp di perangkat ini.");
    }
  }

  function appendDigits(value: string): void {
    setPaymentDigits((current) => normalizeMoneyInput(`${current}${value}`));
    setErrorMessage(null);
    setNoticeMessage(null);
  }

  function openOrderDetail(): void {
    if (route.params.source === "detail") {
      navigation.goBack();
      return;
    }

    navigation.navigate("MainTabs", {
      screen: "OrdersTab",
      params: {
        screen: "OrderDetail",
        params: {
          orderId: route.params.orderId,
          returnToOrders: true,
        },
      },
    });
  }

  function handleDone(): void {
    if (route.params.source === "create") {
      navigation.navigate("MainTabs", {
        screen: "OrdersTab",
        params: {
          screen: "OrdersToday",
        },
      });
      return;
    }

    navigation.goBack();
  }

  if (loading) {
    return (
      <AppScreen contentContainerStyle={[styles.screen, styles.center]}>
        <ActivityIndicator color={theme.colors.primaryStrong} size="large" />
        <Text style={styles.mutedText}>Memuat pembayaran...</Text>
      </AppScreen>
    );
  }

  if (!detail) {
    return (
      <AppScreen contentContainerStyle={[styles.screen, styles.center]}>
        <Ionicons color={theme.colors.danger} name="alert-circle-outline" size={22} />
        <Text style={styles.errorText}>Data order tidak ditemukan.</Text>
        <AppButton leftElement={<Ionicons color={theme.colors.textPrimary} name="arrow-back-outline" size={16} />} onPress={() => navigation.goBack()} title="Kembali" variant="ghost" />
      </AppScreen>
    );
  }

  return (
    <AppScreen contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={() => (stage === "result" ? handleDone() : navigation.goBack())} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}>
          <Ionicons color={theme.colors.info} name="arrow-back" size={19} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{stage === "result" ? resultTitle : "Pembayaran"}</Text>
          <Text numberOfLines={1} style={styles.subtitle}>{detail.invoice_no ?? detail.order_code}</Text>
        </View>
        <View style={styles.ghost} />
      </View>

      {stage === "entry" ? (
        <>
          <View style={styles.card}>
            <View style={styles.amountTopBlock}>
              <Text style={styles.caption}>Sisa Tagihan</Text>
              <Text style={styles.smallAmount}>{formatMoney(dueAmount)}</Text>
            </View>
            <Text style={styles.inputAmountCaption}>Nominal Diterima</Text>
            <Text style={styles.bigAmount}>{formatMoney(tenderedAmount)}</Text>
            <Text style={styles.mutedText}>{detail.customer?.name ?? "-"}</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.row}><Text style={styles.label}>Total</Text><Text style={styles.value}>{formatMoney(detail.total_amount)}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Sudah Dibayar</Text><Text style={styles.value}>{formatMoney(detail.paid_amount)}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Diterima</Text><Text style={styles.value}>{formatMoney(tenderedAmount)}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Tercatat</Text><Text style={styles.value}>{formatMoney(appliedAmount)}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Kembalian</Text><Text style={styles.value}>{formatMoney(changeAmount)}</Text></View>
          </View>

          <View style={styles.inlineRow}>
            {PAYMENT_METHODS.map((option) => {
              const active = option.value === paymentMethodType;
              return (
                <Pressable key={option.value} onPress={() => setPaymentMethodType(option.value)} style={({ pressed }) => [styles.chip, active ? styles.chipActive : null, pressed ? styles.pressed : null]}>
                  <Ionicons color={active ? theme.colors.info : theme.colors.textMuted} name={option.icon} size={14} />
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.inlineRow}>
            {[
              { label: "Uang Pas", value: dueAmount },
              { label: "20.000", value: 20_000 },
              { label: "50.000", value: 50_000 },
              { label: "100.000", value: 100_000 },
            ].map((item) => (
              <Pressable key={item.label} onPress={() => setPaymentDigits(normalizeMoneyInput(`${item.value}`))} style={({ pressed }) => [styles.quickButton, pressed ? styles.pressed : null]}>
                <Text style={styles.quickButtonText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.keypad}>
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0"].map((key) => (
              <Pressable key={key} onPress={() => appendDigits(key)} style={({ pressed }) => [styles.key, pressed ? styles.pressed : null]}>
                <Text style={styles.keyText}>{key}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setPaymentDigits((current) => current.slice(0, -1))} style={({ pressed }) => [styles.key, styles.keyAccent, pressed ? styles.pressed : null]}>
              <Ionicons color={theme.colors.info} name="backspace-outline" size={20} />
            </Pressable>
          </View>

          {errorMessage ? <View style={styles.errorBox}><Text style={styles.errorText}>{errorMessage}</Text></View> : null}
          {noticeMessage ? <View style={styles.noticeBox}><Text style={styles.noticeText}>{noticeMessage}</Text></View> : null}

          <AppButton
            disabled={submitting || (!canSkipPayment && (tenderedAmount <= 0 || dueAmount <= 0))}
            leftElement={<Ionicons color={theme.colors.primaryContrast} name="save-outline" size={16} />}
            loading={submitting}
            onPress={() => void handleSubmit()}
            title={shouldSkipPaymentEntry ? "Lanjut Tanpa Pembayaran" : `Catat Pembayaran (${paymentMethodLabel})`}
          />
        </>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.resultScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.card}>
              <View style={styles.resultIcon}><Ionicons color={theme.colors.success} name="checkmark-done-outline" size={26} /></View>
              <Text style={styles.title}>{resultTitle}</Text>
              {isReceiptResult ? <Text style={styles.inputAmountCaption}>Sisa Tagihan</Text> : null}
              <Text style={styles.bigAmount}>{formatMoney(isReceiptResult ? result?.remainingAmount ?? 0 : result?.appliedAmount ?? 0)}</Text>
            </View>

            <View style={styles.card}>
              {isReceiptResult ? <View style={styles.row}><Text style={styles.label}>Total</Text><Text style={styles.value}>{formatMoney(detail.total_amount)}</Text></View> : null}
              <View style={styles.row}><Text style={styles.label}>{isReceiptResult ? "Sudah Dibayar" : "Nominal Diterima"}</Text><Text style={styles.value}>{formatMoney(isReceiptResult ? detail.paid_amount : result?.tenderedAmount ?? 0)}</Text></View>
              {isReceiptResult ? null : <View style={styles.row}><Text style={styles.label}>Tercatat</Text><Text style={styles.value}>{formatMoney(result?.appliedAmount ?? 0)}</Text></View>}
              <View style={styles.row}><Text style={styles.label}>Sisa Tagihan</Text><Text style={[styles.value, (result?.remainingAmount ?? 0) > 0 ? styles.warnText : styles.okText]}>{formatMoney(result?.remainingAmount ?? 0)}</Text></View>
              {!isReceiptResult && paymentMethodType === "cash" ? <View style={styles.row}><Text style={styles.label}>Kembalian</Text><Text style={styles.value}>{formatMoney(result?.changeAmount ?? 0)}</Text></View> : null}
              <View style={styles.row}><Text style={styles.label}>Waktu</Text><Text style={styles.value}>{formatDateTime(detail.updated_at)}</Text></View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Cetak / Bagikan Nota</Text>
              <Pressable onPress={() => void handleShareReceipt("customer")} style={({ pressed }) => [styles.actionRow, pressed ? styles.pressed : null]}>
                <View style={styles.actionCopy}><Text style={styles.actionTitle}>Struk Konsumen</Text><Text style={styles.actionHint}>Dengan harga, siap dibagikan atau dicetak</Text></View>
                <Ionicons color={theme.colors.info} name="share-social-outline" size={17} />
              </Pressable>
              <Pressable onPress={() => void handleShareReceipt("production")} style={({ pressed }) => [styles.actionRow, pressed ? styles.pressed : null]}>
                <View style={styles.actionCopy}><Text style={styles.actionTitle}>Struk Produksi</Text><Text style={styles.actionHint}>Tanpa harga untuk operasional</Text></View>
                <Ionicons color={theme.colors.info} name="print-outline" size={17} />
              </Pressable>
              <Pressable onPress={() => void handleOpenWhatsApp()} style={({ pressed }) => [styles.actionRow, pressed ? styles.pressed : null]}>
                <View style={styles.actionCopy}><Text style={styles.actionTitle}>Kirim ke WhatsApp</Text><Text style={styles.actionHint}>{isReceiptResult ? "Kirim ringkasan pesanan dan tagihan ke pelanggan" : "Kirim status dan ringkasan pembayaran ke pelanggan"}</Text></View>
                <Ionicons color={theme.colors.success} name="logo-whatsapp" size={17} />
              </Pressable>
              <Pressable onPress={openOrderDetail} style={({ pressed }) => [styles.actionRow, pressed ? styles.pressed : null]}>
                <View style={styles.actionCopy}><Text style={styles.actionTitle}>Buka Detail Order</Text><Text style={styles.actionHint}>Lanjut cek status dan ringkasan pesanan</Text></View>
                <Ionicons color={theme.colors.info} name="receipt-outline" size={17} />
              </Pressable>
            </View>

          </ScrollView>
          <View style={styles.resultFooterStack}>
            {errorMessage ? <View style={styles.errorBox}><Text style={styles.errorText}>{errorMessage}</Text></View> : null}
            {noticeMessage ? <View style={styles.noticeBox}><Text style={styles.noticeText}>{noticeMessage}</Text></View> : null}
            <AppButton leftElement={<Ionicons color={theme.colors.primaryContrast} name="checkmark-outline" size={17} />} onPress={handleDone} title="Selesai" />
          </View>
        </>
      )}
    </AppScreen>
  );
}

const createStyles = (theme: ReturnType<typeof useAppTheme>, isTablet: boolean, isLandscape: boolean) =>
  StyleSheet.create({
    screen: { flex: 1, gap: 12, paddingHorizontal: isTablet ? 20 : 16, paddingTop: isLandscape ? 10 : 12, paddingBottom: isLandscape ? 12 : 16 },
    center: { alignItems: "center", justifyContent: "center" },
    header: { flexDirection: "row", alignItems: "center", gap: 12 },
    headerCopy: { flex: 1, alignItems: "center", gap: 2 },
    iconButton: { width: 42, height: 42, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" },
    ghost: { width: 42, height: 42 },
    card: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.lg, backgroundColor: theme.colors.surface, padding: 14, gap: 10 },
    amountTopBlock: { gap: 2 },
    caption: { color: theme.colors.textMuted, fontFamily: theme.fonts.semibold, fontSize: isTablet ? 12 : 11, textTransform: "uppercase" },
    smallAmount: { color: theme.colors.textSecondary, fontFamily: theme.fonts.semibold, fontSize: isTablet ? 20 : 17 },
    inputAmountCaption: { color: theme.colors.textMuted, fontFamily: theme.fonts.semibold, fontSize: isTablet ? 12 : 11, textAlign: "center", textTransform: "uppercase" },
    title: { color: theme.colors.textPrimary, fontFamily: theme.fonts.bold, fontSize: isTablet ? 20 : 18, textAlign: "center" },
    subtitle: { color: theme.colors.textMuted, fontFamily: theme.fonts.medium, fontSize: isTablet ? 12 : 11 },
    bigAmount: { color: theme.colors.textPrimary, fontFamily: theme.fonts.bold, fontSize: isTablet ? 32 : 28, textAlign: "center" },
    mutedText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.medium, fontSize: isTablet ? 13 : 12, textAlign: "center" },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    label: { color: theme.colors.textSecondary, fontFamily: theme.fonts.medium, fontSize: isTablet ? 13 : 12 },
    value: { color: theme.colors.textPrimary, fontFamily: theme.fonts.semibold, fontSize: isTablet ? 13 : 12, textAlign: "right" },
    inlineRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surface, flexGrow: 1 },
    chipActive: { borderColor: theme.colors.info, backgroundColor: theme.colors.primarySoft },
    chipText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.semibold, fontSize: isTablet ? 12 : 11 },
    chipTextActive: { color: theme.colors.info },
    quickButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: theme.radii.md, backgroundColor: theme.colors.primaryStrong, alignItems: "center", justifyContent: "center" },
    quickButtonText: { color: theme.colors.primaryContrast, fontFamily: theme.fonts.bold, fontSize: isTablet ? 12 : 11 },
    keypad: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    key: { width: "31%", minHeight: 56, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.lg, backgroundColor: theme.colors.surface, alignItems: "center", justifyContent: "center" },
    keyAccent: { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.info },
    keyText: { color: theme.colors.textPrimary, fontFamily: theme.fonts.bold, fontSize: isTablet ? 24 : 20 },
    errorBox: { borderWidth: 1, borderColor: theme.colors.danger, borderRadius: theme.radii.md, backgroundColor: theme.mode === "dark" ? "rgba(209,74,74,0.12)" : "rgba(255,244,244,0.95)", paddingHorizontal: 12, paddingVertical: 10 },
    noticeBox: { borderWidth: 1, borderColor: theme.colors.success, borderRadius: theme.radii.md, backgroundColor: theme.mode === "dark" ? "rgba(39,174,96,0.12)" : "rgba(241,255,246,0.95)", paddingHorizontal: 12, paddingVertical: 10 },
    errorText: { color: theme.colors.danger, fontFamily: theme.fonts.medium, fontSize: isTablet ? 12 : 11 },
    noticeText: { color: theme.colors.success, fontFamily: theme.fonts.medium, fontSize: isTablet ? 12 : 11 },
    resultScroll: { gap: 12, paddingBottom: 6 },
    resultFooterStack: { gap: 10 },
    resultIcon: { width: 64, height: 64, borderRadius: 999, backgroundColor: theme.mode === "dark" ? "rgba(39,174,96,0.14)" : "rgba(39,174,96,0.12)", alignItems: "center", justifyContent: "center", alignSelf: "center" },
    sectionTitle: { color: theme.colors.textPrimary, fontFamily: theme.fonts.bold, fontSize: isTablet ? 14 : 13 },
    actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceSoft, paddingHorizontal: 12, paddingVertical: 12 },
    actionCopy: { flex: 1, gap: 2 },
    actionTitle: { color: theme.colors.textPrimary, fontFamily: theme.fonts.semibold, fontSize: isTablet ? 13 : 12 },
    actionHint: { color: theme.colors.textMuted, fontFamily: theme.fonts.medium, fontSize: isTablet ? 11 : 10 },
    warnText: { color: theme.colors.warning },
    okText: { color: theme.colors.success },
    pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  });
