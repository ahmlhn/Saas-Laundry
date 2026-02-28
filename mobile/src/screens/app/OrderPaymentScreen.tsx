import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { captureRef } from "react-native-view-shot";
import { AppScreen } from "../../components/layout/AppScreen";
import { AppButton } from "../../components/ui/AppButton";
import { addOrderPayment, getOrderDetail } from "../../features/orders/orderApi";
import { buildOrderReceiptText, buildOrderWhatsAppMessage } from "../../features/orders/orderReceipt";
import { shareReceiptImageToCustomerOnWhatsApp } from "../../features/orders/whatsAppReceiptShare";
import { getStoredBluetoothThermalPrinter } from "../../features/settings/printerBluetoothStorage";
import { DEFAULT_PRINTER_NOTE_SETTINGS, getPrinterNoteSettings } from "../../features/settings/printerNoteStorage";
import { DEFAULT_PRINTER_LOCAL_SETTINGS, getPrinterLocalSettings } from "../../features/settings/printerLocalSettingsStorage";
import { printBluetoothThermalReceipt } from "../../features/settings/thermalBluetoothPrinter";
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

function normalizeWhatsAppPhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }

  if (digits.startsWith("0")) {
    return `62${digits.slice(1)}`;
  }

  if (digits.startsWith("62")) {
    return digits;
  }

  return digits;
}

async function openCustomerWhatsAppChat(phoneDigits: string, message: string): Promise<boolean> {
  const encodedMessage = encodeURIComponent(message);
  const candidates = [
    `whatsapp://send?phone=${phoneDigits}&text=${encodedMessage}`,
    `https://wa.me/${phoneDigits}?text=${encodedMessage}`,
  ];

  for (const candidate of candidates) {
    try {
      const supported = await Linking.canOpenURL(candidate);
      if (!supported) {
        continue;
      }
      await Linking.openURL(candidate);
      return true;
    } catch {
      // Try the next candidate.
    }
  }

  return false;
}

export function OrderPaymentScreen() {
  const theme = useAppTheme();
  const { width, height } = useWindowDimensions();
  const minEdge = Math.min(width, height);
  const isTablet = minEdge >= 600;
  const isLandscape = width > height;
  const isCompactHeight = height <= (isTablet ? 760 : isLandscape ? 560 : 860);
  const isVeryCompactHeight = height <= (isTablet ? 680 : isLandscape ? 500 : 760);
  const navigation = useNavigation<Navigation>();
  const route = useRoute<PaymentRoute>();
  const { selectedOutlet } = useSession();
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [printerNoteSettings, setPrinterNoteSettings] = useState(() => ({
    ...DEFAULT_PRINTER_NOTE_SETTINGS,
    profileName: selectedOutlet?.name || "",
  }));
  const [receiptPaperWidth, setReceiptPaperWidth] = useState(DEFAULT_PRINTER_LOCAL_SETTINGS.paperWidth);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethodType, setPaymentMethodType] = useState<PaymentMethodType>(route.params.initialMethod ?? "cash");
  const [paymentDigits, setPaymentDigits] = useState("");
  const [receiptCaptureText, setReceiptCaptureText] = useState("");
  const [stage, setStage] = useState<Stage>("entry");
  const [result, setResult] = useState<ResultSummary | null>(null);
  const styles = useMemo(
    () => createStyles(theme, isTablet, isLandscape, isCompactHeight, isVeryCompactHeight),
    [theme, isTablet, isLandscape, isCompactHeight, isVeryCompactHeight],
  );
  const isReceiptOnly = route.params.flow === "receipt";
  const canSkipPayment = route.params.source === "create";
  const receiptCaptureRef = useRef<View | null>(null);

  const outletLabel = selectedOutlet ? `${selectedOutlet.code} - ${selectedOutlet.name}` : "Outlet belum dipilih";
  const dueAmount = Math.max(detail?.due_amount ?? 0, 0);
  const tenderedAmount = useMemo(() => parseMoneyInput(paymentDigits), [paymentDigits]);
  const appliedAmount = useMemo(() => Math.min(tenderedAmount, dueAmount), [tenderedAmount, dueAmount]);
  const changeAmount = useMemo(() => (paymentMethodType === "cash" ? Math.max(tenderedAmount - dueAmount, 0) : 0), [paymentMethodType, tenderedAmount, dueAmount]);
  const paymentMethodLabel = useMemo(() => PAYMENT_METHODS.find((item) => item.value === paymentMethodType)?.label ?? "Tunai", [paymentMethodType]);
  const isReceiptResult = stage === "result" && (isReceiptOnly || (canSkipPayment && (result?.tenderedAmount ?? 0) <= 0 && (result?.appliedAmount ?? 0) <= 0));
  const shouldSkipPaymentEntry = canSkipPayment && (tenderedAmount <= 0 || dueAmount <= 0);
  const resultTitle = isReceiptResult ? "Pesanan Berhasil Disimpan" : (result?.remainingAmount ?? 0) > 0 ? "Pembayaran Tercatat" : "Pembayaran Berhasil";
  const receiptShareWidth = receiptPaperWidth === "80mm" ? 420 : 300;
  const customerPhoneDigits = useMemo(() => normalizeWhatsAppPhone(detail?.customer?.phone_normalized), [detail?.customer?.phone_normalized]);
  const customerReceiptShareText = useMemo(
    () =>
      detail
        ? buildOrderReceiptText({
            kind: "customer",
            order: detail,
            outletLabel,
            paperWidth: receiptPaperWidth,
            noteSettings: printerNoteSettings,
          })
        : "",
    [detail, outletLabel, printerNoteSettings, receiptPaperWidth],
  );

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

  useEffect(() => {
    let active = true;

    void getPrinterLocalSettings(selectedOutlet?.id)
      .then((settings) => {
        if (active) {
          setReceiptPaperWidth(settings.paperWidth);
        }
      })
      .catch(() => {
        if (active) {
          setReceiptPaperWidth(DEFAULT_PRINTER_LOCAL_SETTINGS.paperWidth);
        }
      });

    void getPrinterNoteSettings(selectedOutlet?.id)
      .then((settings) => {
        if (active) {
          setPrinterNoteSettings({
            ...settings,
            profileName: settings.profileName.trim() || selectedOutlet?.name || "",
          });
        }
      })
      .catch(() => {
        if (active) {
          setPrinterNoteSettings({
            ...DEFAULT_PRINTER_NOTE_SETTINGS,
            profileName: selectedOutlet?.name || "",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [selectedOutlet?.id, selectedOutlet?.name]);

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

  async function handlePrintReceipt(kind: "customer" | "production"): Promise<void> {
    if (!detail) {
      return;
    }

    setErrorMessage(null);
    setNoticeMessage(null);

    try {
      const latestDetail = await getOrderDetail(detail.id).catch(() => detail);
      if (latestDetail !== detail) {
        setDetail(latestDetail);
      }
      const printerSettings = await getPrinterLocalSettings(selectedOutlet?.id).catch(() => DEFAULT_PRINTER_LOCAL_SETTINGS);
      const noteSettings = await getPrinterNoteSettings(selectedOutlet?.id).catch(() => ({
        ...DEFAULT_PRINTER_NOTE_SETTINGS,
        profileName: selectedOutlet?.name || "",
      }));
      const pairedPrinter = await getStoredBluetoothThermalPrinter(selectedOutlet?.id);
      if (!pairedPrinter?.address) {
        setErrorMessage("Belum ada printer thermal yang tersanding. Atur printer terlebih dulu di menu Printer & Nota.");
        return;
      }

      await printBluetoothThermalReceipt(
        pairedPrinter.address,
        buildOrderReceiptText({
          kind,
          order: latestDetail,
          outletLabel,
          paperWidth: printerSettings.paperWidth,
          noteSettings,
        }),
        printerSettings,
        noteSettings.logoUrl || null,
      );
      setNoticeMessage(kind === "production" ? "Nota produksi sedang dicetak." : "Nota konsumen sedang dicetak.");
    } catch (error) {
      const message = error instanceof Error && error.message.trim() ? error.message.trim() : "Gagal mencetak nota ke printer.";
      setErrorMessage(message);
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
      const latestDetail = await getOrderDetail(detail.id).catch(() => detail);
      if (latestDetail !== detail) {
        setDetail(latestDetail);
      }
      const latestPrinterNoteSettings = await getPrinterNoteSettings(selectedOutlet?.id).catch(() => ({
        ...DEFAULT_PRINTER_NOTE_SETTINGS,
        profileName: selectedOutlet?.name || "",
      }));
      setPrinterNoteSettings(latestPrinterNoteSettings);
      const latestCustomerPhoneDigits = normalizeWhatsAppPhone(latestDetail.customer?.phone_normalized);
      if (!latestCustomerPhoneDigits) {
        setErrorMessage("Nomor WhatsApp pelanggan belum valid.");
        return;
      }

      setReceiptCaptureText(
        buildOrderReceiptText({
          kind: "customer",
          order: latestDetail,
          outletLabel,
          paperWidth: receiptPaperWidth,
          noteSettings: latestPrinterNoteSettings,
        }),
      );

      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), 120);
      });

      if (!receiptCaptureRef.current) {
        setErrorMessage("Gambar nota belum siap. Coba beberapa detik lagi.");
        return;
      }

      const imageUri = await captureRef(receiptCaptureRef.current, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      const waMessage = buildOrderWhatsAppMessage(latestDetail, outletLabel);

      try {
        await shareReceiptImageToCustomerOnWhatsApp({
          phoneDigits: latestCustomerPhoneDigits,
          imageUri,
          message: waMessage,
        });
        setNoticeMessage("WhatsApp dibuka ke nomor pelanggan dengan gambar nota terlampir.");
      } catch (directShareError) {
        const openedDirectChat = await openCustomerWhatsAppChat(latestCustomerPhoneDigits, waMessage);
        if (openedDirectChat) {
          setNoticeMessage("Chat WhatsApp pelanggan dibuka langsung. Jika gambar belum terlampir, kirim nota melalui tombol struk atau bagikan manual.");
          return;
        }

        await Share.share(
          {
            title: "Nota Konsumen Laundry",
            message: waMessage,
            url: imageUri,
          },
          {
            dialogTitle: "Kirim Nota ke WhatsApp",
            subject: "Nota Konsumen Laundry",
          },
        );
        const fallbackMessage =
          directShareError instanceof Error && directShareError.message.trim()
            ? directShareError.message.trim()
            : "WhatsApp langsung tidak tersedia di build ini.";
        setNoticeMessage(`${fallbackMessage} Gambar nota sudah dibuat. Pilih WhatsApp di menu bagikan, lalu kirim ke pelanggan ${latestDetail.customer?.name ?? ""}.`.trim());
      }
    } catch (error) {
      const message = error instanceof Error && error.message.trim() ? error.message.trim() : "Gagal menyiapkan gambar nota untuk dibagikan.";
      setErrorMessage(message);
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
          <View style={styles.entryContent}>
            <View style={[styles.card, styles.amountHeroCard]}>
              <View style={styles.amountHeroTopRow}>
                <View style={styles.amountTopBlock}>
                  <Text style={styles.caption}>Sisa Tagihan Saat Ini</Text>
                  <Text style={styles.smallAmount}>{formatMoney(dueAmount)}</Text>
                </View>
                <View style={styles.customerChip}>
                  <Ionicons color={theme.colors.info} name="person-outline" size={15} />
                  <Text numberOfLines={1} style={styles.customerChipText}>
                    {detail.customer?.name ?? "-"}
                  </Text>
                </View>
              </View>
              <View style={styles.amountDisplayWrap}>
                <Text style={styles.inputAmountCaption}>Nominal Diterima</Text>
                <Text style={styles.bigAmount}>{formatMoney(tenderedAmount)}</Text>
                {shouldSkipPaymentEntry ? <Text style={styles.amountHeroHint}>Biarkan Rp 0 untuk simpan sebagai bayar nanti</Text> : null}
              </View>
            </View>

            <Text style={styles.entrySectionLabel}>Metode Pembayaran</Text>
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

            <Text style={styles.entrySectionLabel}>Nominal Cepat</Text>
            <View style={styles.quickAmountGrid}>
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

            <View style={[styles.card, styles.keypadCard]}>
              <View style={styles.keypad}>
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0"].map((key) => (
                  <Pressable key={key} onPress={() => appendDigits(key)} style={({ pressed }) => [styles.key, pressed ? styles.pressed : null]}>
                    <Text style={styles.keyText}>{key}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => setPaymentDigits((current) => current.slice(0, -1))} style={({ pressed }) => [styles.key, styles.keyAccent, pressed ? styles.pressed : null]}>
                  <Ionicons color={theme.colors.info} name="backspace-outline" size={22} />
                </Pressable>
              </View>
            </View>
          </View>

          <View style={styles.entryFooterStack}>
            {errorMessage ? <View style={styles.errorBox}><Text style={styles.errorText}>{errorMessage}</Text></View> : null}
            {noticeMessage ? <View style={styles.noticeBox}><Text style={styles.noticeText}>{noticeMessage}</Text></View> : null}
            <AppButton
              disabled={submitting || (!canSkipPayment && (tenderedAmount <= 0 || dueAmount <= 0))}
              leftElement={<Ionicons color={theme.colors.primaryContrast} name="save-outline" size={16} />}
              loading={submitting}
              onPress={() => void handleSubmit()}
              title={shouldSkipPaymentEntry ? "Lanjut Tanpa Pembayaran" : `Catat Pembayaran (${paymentMethodLabel})`}
            />
          </View>
        </>
      ) : (
        <>
          <View pointerEvents="none" style={styles.hiddenReceiptCaptureWrap}>
            <View
              collapsable={false}
              ref={receiptCaptureRef}
              style={[styles.hiddenReceiptCaptureCard, { width: receiptShareWidth }]}
            >
              <Text style={styles.hiddenReceiptCaptureText}>{receiptCaptureText || customerReceiptShareText}</Text>
            </View>
          </View>
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
              <Pressable onPress={() => void handlePrintReceipt("customer")} style={({ pressed }) => [styles.actionRow, pressed ? styles.pressed : null]}>
                <View style={styles.actionCopy}><Text style={styles.actionTitle}>Struk Konsumen</Text><Text style={styles.actionHint}>Dengan harga, langsung cetak ke printer</Text></View>
                <Ionicons color={theme.colors.info} name="print-outline" size={17} />
              </Pressable>
              <Pressable onPress={() => void handlePrintReceipt("production")} style={({ pressed }) => [styles.actionRow, pressed ? styles.pressed : null]}>
                <View style={styles.actionCopy}><Text style={styles.actionTitle}>Struk Produksi</Text><Text style={styles.actionHint}>Tanpa harga, langsung cetak ke printer</Text></View>
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

const createStyles = (
  theme: ReturnType<typeof useAppTheme>,
  isTablet: boolean,
  isLandscape: boolean,
  isCompactHeight: boolean,
  isVeryCompactHeight: boolean,
) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      gap: isVeryCompactHeight ? 8 : isCompactHeight ? 10 : 12,
      paddingHorizontal: isTablet ? 20 : 16,
      paddingTop: isLandscape ? 8 : isVeryCompactHeight ? 8 : 12,
      paddingBottom: isLandscape ? 8 : isVeryCompactHeight ? 10 : 16,
    },
    center: { alignItems: "center", justifyContent: "center" },
    header: { flexDirection: "row", alignItems: "center", gap: isVeryCompactHeight ? 8 : 12 },
    headerCopy: { flex: 1, alignItems: "center", gap: 2 },
    iconButton: {
      width: isVeryCompactHeight ? 38 : 42,
      height: isVeryCompactHeight ? 38 : 42,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 999,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    ghost: { width: isVeryCompactHeight ? 38 : 42, height: isVeryCompactHeight ? 38 : 42 },
    card: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      padding: isVeryCompactHeight ? 10 : isCompactHeight ? 12 : 14,
      gap: isVeryCompactHeight ? 8 : 10,
    },
    amountHeroCard: {
      gap: isVeryCompactHeight ? 10 : isCompactHeight ? 12 : 14,
      paddingVertical: isVeryCompactHeight ? 10 : isCompactHeight ? 12 : 16,
    },
    amountHeroTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: isVeryCompactHeight ? 8 : 10 },
    amountTopBlock: { flex: 1, gap: 2 },
    amountDisplayWrap: { alignItems: "center", gap: 4 },
    amountHeroHint: { color: theme.colors.textSecondary, fontFamily: theme.fonts.medium, fontSize: isTablet ? 13 : 11.5, textAlign: "center" },
    customerChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      maxWidth: isTablet ? 240 : isVeryCompactHeight ? 150 : isCompactHeight ? 165 : 180,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.surfaceSoft,
      paddingHorizontal: isVeryCompactHeight ? 8 : 10,
      paddingVertical: isVeryCompactHeight ? 5 : 7,
    },
    customerChipText: {
      flexShrink: 1,
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: isTablet ? 12.5 : isVeryCompactHeight ? 10.5 : 11.5,
    },
    caption: { color: theme.colors.textMuted, fontFamily: theme.fonts.semibold, fontSize: isTablet ? 13 : isVeryCompactHeight ? 10.5 : 12, textTransform: "uppercase" },
    smallAmount: { color: theme.colors.textSecondary, fontFamily: theme.fonts.semibold, fontSize: isTablet ? 24 : isVeryCompactHeight ? 16 : isCompactHeight ? 18 : 20 },
    inputAmountCaption: { color: theme.colors.textMuted, fontFamily: theme.fonts.semibold, fontSize: isTablet ? 13 : isVeryCompactHeight ? 10.5 : 12, textAlign: "center", textTransform: "uppercase" },
    title: { color: theme.colors.textPrimary, fontFamily: theme.fonts.bold, fontSize: isTablet ? 24 : isVeryCompactHeight ? 18 : isCompactHeight ? 19 : 21, textAlign: "center" },
    subtitle: { color: theme.colors.textMuted, fontFamily: theme.fonts.medium, fontSize: isTablet ? 13 : isVeryCompactHeight ? 10.5 : 12 },
    bigAmount: { color: theme.colors.textPrimary, fontFamily: theme.fonts.bold, fontSize: isTablet ? 40 : isVeryCompactHeight ? 28 : isCompactHeight ? 31 : 34, textAlign: "center" },
    mutedText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.medium, fontSize: isTablet ? 14 : 13, textAlign: "center" },
    row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    label: { color: theme.colors.textSecondary, fontFamily: theme.fonts.medium, fontSize: isTablet ? 15 : 13 },
    value: { color: theme.colors.textPrimary, fontFamily: theme.fonts.semibold, fontSize: isTablet ? 15 : 13, textAlign: "right" },
    entryContent: { flex: 1, minHeight: 0, gap: isVeryCompactHeight ? 8 : isCompactHeight ? 10 : 12 },
    entryFooterStack: { gap: 8, paddingTop: isVeryCompactHeight ? 2 : 4 },
    entrySectionLabel: {
      color: theme.colors.textSecondary,
      fontFamily: theme.fonts.semibold,
      fontSize: isTablet ? 13 : isVeryCompactHeight ? 10.5 : 12,
      marginTop: isVeryCompactHeight ? 0 : 2,
    },
    inlineRow: { flexDirection: "row", flexWrap: "wrap", gap: isVeryCompactHeight ? 6 : 8 },
    chip: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: isVeryCompactHeight ? 38 : isCompactHeight ? 40 : 46, paddingHorizontal: isVeryCompactHeight ? 10 : 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surface, flexGrow: 1 },
    chipActive: { borderColor: theme.colors.info, backgroundColor: theme.colors.primarySoft },
    chipText: { color: theme.colors.textSecondary, fontFamily: theme.fonts.semibold, fontSize: isTablet ? 13 : isVeryCompactHeight ? 10.5 : 12 },
    chipTextActive: { color: theme.colors.info },
    quickAmountGrid: { flexDirection: "row", flexWrap: "wrap", gap: isVeryCompactHeight ? 6 : 8 },
    quickButton: {
      width: isTablet || isCompactHeight ? "23.5%" : "48.5%",
      minHeight: isVeryCompactHeight ? 34 : isCompactHeight ? 36 : 44,
      paddingHorizontal: isVeryCompactHeight ? 8 : 12,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.primaryStrong,
      alignItems: "center",
      justifyContent: "center",
    },
    quickButtonText: { color: theme.colors.primaryContrast, fontFamily: theme.fonts.bold, fontSize: isTablet ? 14 : isVeryCompactHeight ? 10.5 : 12 },
    keypadCard: { paddingTop: isVeryCompactHeight ? 8 : isCompactHeight ? 10 : 12 },
    keypad: { flexDirection: "row", flexWrap: "wrap", gap: isVeryCompactHeight ? 6 : isCompactHeight ? 8 : 10 },
    key: {
      width: "31%",
      aspectRatio: isTablet ? 1.9 : isVeryCompactHeight ? 2.35 : isCompactHeight ? 2.05 : 1.8,
      minHeight: isTablet ? 58 : undefined,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    keyAccent: { backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.info },
    keyText: { color: theme.colors.textPrimary, fontFamily: theme.fonts.bold, fontSize: isTablet ? 28 : isVeryCompactHeight ? 20 : isCompactHeight ? 22 : 24 },
    errorBox: { borderWidth: 1, borderColor: theme.colors.danger, borderRadius: theme.radii.md, backgroundColor: theme.mode === "dark" ? "rgba(209,74,74,0.12)" : "rgba(255,244,244,0.95)", paddingHorizontal: isVeryCompactHeight ? 10 : 12, paddingVertical: isVeryCompactHeight ? 8 : 10 },
    noticeBox: { borderWidth: 1, borderColor: theme.colors.success, borderRadius: theme.radii.md, backgroundColor: theme.mode === "dark" ? "rgba(39,174,96,0.12)" : "rgba(241,255,246,0.95)", paddingHorizontal: isVeryCompactHeight ? 10 : 12, paddingVertical: isVeryCompactHeight ? 8 : 10 },
    errorText: { color: theme.colors.danger, fontFamily: theme.fonts.medium, fontSize: isTablet ? 13 : isVeryCompactHeight ? 11 : 12 },
    noticeText: { color: theme.colors.success, fontFamily: theme.fonts.medium, fontSize: isTablet ? 13 : isVeryCompactHeight ? 11 : 12 },
    hiddenReceiptCaptureWrap: {
      position: "absolute",
      left: -10_000,
      top: -10_000,
    },
    hiddenReceiptCaptureCard: {
      backgroundColor: "#ffffff",
      paddingHorizontal: 18,
      paddingVertical: 18,
    },
    hiddenReceiptCaptureText: {
      color: "#111111",
      fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: theme.fonts.medium }),
      fontSize: 13,
      lineHeight: 19,
    },
    resultScroll: { gap: 12, paddingBottom: 6 },
    resultFooterStack: { gap: 10 },
    resultIcon: { width: 64, height: 64, borderRadius: 999, backgroundColor: theme.mode === "dark" ? "rgba(39,174,96,0.14)" : "rgba(39,174,96,0.12)", alignItems: "center", justifyContent: "center", alignSelf: "center" },
    sectionTitle: { color: theme.colors.textPrimary, fontFamily: theme.fonts.bold, fontSize: isTablet ? 16 : 14 },
    actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.md, backgroundColor: theme.colors.surfaceSoft, paddingHorizontal: 12, paddingVertical: 12 },
    actionCopy: { flex: 1, gap: 2 },
    actionTitle: { color: theme.colors.textPrimary, fontFamily: theme.fonts.semibold, fontSize: isTablet ? 14 : 13 },
    actionHint: { color: theme.colors.textMuted, fontFamily: theme.fonts.medium, fontSize: isTablet ? 12 : 11 },
    warnText: { color: theme.colors.warning },
    okText: { color: theme.colors.success },
    pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  });
