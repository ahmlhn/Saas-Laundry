import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  C,
  WIDTH,
  HEIGHT,
  svg,
  rect,
  line,
  textLines,
  pill,
  button,
  input,
  metricCard,
  bottomTab,
  gradients,
  heroBlue,
} from "./lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = path.join(ROOT, "docs", "penpot-blueprint");

function constUrgentCard(x, y, fill, stroke, title, rank, subtitle, rankColor) {
  return [
    rect(x, y, 292, 54, fill, stroke, 18, 1),
    textLines(x + 14, y + 24, [title], { size: 12, weight: 800, fill: C.text }),
    textLines(x + 14, y + 42, [subtitle], { size: 11, weight: 600, fill: C.muted }),
    textLines(x + 276, y + 24, [rank], { size: 11, weight: 800, fill: rankColor, anchor: "end" }),
  ].join("");
}

function timelineRow(x, y, dotColor, title, subtitle) {
  return [
    rect(x, y, 10, 10, dotColor, "none", 5, 0),
    textLines(x + 20, y + 10, [title], { size: 12, weight: 800, fill: C.text }),
    textLines(x + 20, y + 28, [subtitle], { size: 11, weight: 600, fill: C.muted }),
  ].join("");
}

function compactMetricCard(x, y, w, h, value, label, tone = "info") {
  const fills = {
    info: ["#eef8ff", C.info],
    warning: ["#fff4de", C.warning],
    success: ["#edf9f1", C.success],
    danger: ["#ffe8ed", C.danger],
  };
  const [chipFill, chipText] = fills[tone];
  return [
    rect(x, y, w, h, C.surface, C.border, 22, 1),
    rect(x + 14, y + 14, 30, 30, chipFill, "none", 10, 0),
    textLines(x + 29, y + 35, [String(value).slice(0, 2)], { size: 10, weight: 800, fill: chipText, anchor: "middle" }),
    textLines(x + 14, y + 66, [String(value)], { size: 22, weight: 800, fill: C.text }),
    textLines(x + 14, y + 84, [label], { size: 11, weight: 700, fill: C.muted }),
  ].join("");
}

function laneCard(x, y, title, count, accent, fill = "rgba(255,255,255,0.1)") {
  return [
    rect(x, y, 92, 66, fill, "rgba(255,255,255,0.12)", 20, 1),
    textLines(x + 14, y + 24, [title], { size: 11, weight: 700, fill: "rgba(255,255,255,0.72)" }),
    textLines(x + 14, y + 52, [String(count)], { size: 26, weight: 800, fill: "#ffffff" }),
    rect(x + 62, y + 14, 16, 16, accent, "none", 8, 0),
  ].join("");
}

function screenFoundations() {
  const body = [
    textLines(24, 38, ["Laundry Poin", "Foundations"], { size: 24, weight: 800, fill: C.text, lineHeight: 28 }),
    textLines(24, 96, ["Palette, typography, and core components for rebuild in Penpot."], { size: 12, weight: 600, fill: C.muted }),
  ];
  const swatches = [
    ["Background", C.bg],
    ["Surface", C.surface],
    ["Primary", C.primaryStrong],
    ["Info", C.info],
    ["Success", C.success],
    ["Warning", C.warning],
    ["Danger", C.danger],
    ["Text", C.text],
  ];
  swatches.forEach(([label, fill], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 24 + col * 156;
    const y = 130 + row * 72;
    body.push(rect(x, y, 140, 58, C.surface, C.border, 18, 1));
    body.push(rect(x + 12, y + 12, 36, 36, fill, "none", 12, 0));
    body.push(textLines(x + 60, y + 28, [label], { size: 12, weight: 800, fill: C.text }));
    body.push(textLines(x + 60, y + 45, [fill], { size: 10, weight: 600, fill: C.muted }));
  });
  body.push(rect(24, 438, 312, 132, C.surface, C.border, 24, 1));
  body.push(textLines(40, 466, ["Typography"], { size: 13, weight: 800, fill: C.text }));
  body.push(textLines(40, 500, ["Display 30 / ExtraBold"], { size: 24, weight: 800, fill: C.text }));
  body.push(textLines(40, 528, ["Section 16 / ExtraBold"], { size: 16, weight: 800, fill: C.text }));
  body.push(textLines(40, 550, ["Body 13 / Medium"], { size: 13, weight: 500, fill: C.text2 }));
  body.push(textLines(40, 570, ["Caption 11 / Semibold"], { size: 11, weight: 700, fill: C.muted }));
  body.push(rect(24, 590, 312, 150, C.surface, C.border, 24, 1));
  body.push(textLines(40, 618, ["Components"], { size: 13, weight: 800, fill: C.text }));
  body.push(button(40, 640, 124, 46, "Primary"));
  body.push(button(176, 640, 124, 46, "Secondary", { fill: "#eef8ff", stroke: C.borderStrong, color: C.info }));
  body.push(pill(40, 700, 70, 28, "Info", "#eef8ff", C.borderStrong, C.info));
  body.push(pill(118, 700, 82, 28, "Success", "#edf9f1", "#bfe7cf", C.success));
  body.push(pill(208, 700, 84, 28, "Warning", "#fff4de", "#f1d6a5", C.warning));
  return svg("Foundations", gradients(), body.join(""));
}

function screenLogin() {
  const body = [
    rect(18, 18, 324, 248, "url(#g-login)", "none", 30, 0),
    rect(258, 30, 54, 54, "rgba(255,255,255,0.16)", "rgba(255,255,255,0.22)", 18, 1),
    rect(270, 42, 30, 30, "#ffffff", "none", 10, 0),
    textLines(34, 56, ["Laundry Poin"], { size: 28, weight: 800, fill: "#ffffff" }),
    textLines(34, 74, ["Mobile operations"], { size: 12, weight: 700, fill: "rgba(255,255,255,0.82)", letterSpacing: 1 }),
    textLines(34, 122, ["Masuk ke panel kasir", "yang bersih dan cepat."], { size: 30, weight: 800, fill: "#ffffff", lineHeight: 34 }),
    textLines(34, 192, ["Pantau order, pembayaran, nota, dan aktivitas outlet", "dari satu aplikasi mobile."], { size: 13, weight: 600, fill: "rgba(255,255,255,0.84)", lineHeight: 18 }),
    pill(34, 220, 86, 30, "Sync Online", "rgba(255,255,255,0.14)", "rgba(255,255,255,0.2)", "#ffffff"),
    pill(128, 220, 72, 30, "WA Ready", "rgba(255,255,255,0.14)", "rgba(255,255,255,0.2)", "#ffffff"),
    rect(18, 280, 324, 430, C.surface, C.border, 24, 1),
    textLines(36, 312, ["Masuk"], { size: 19, weight: 800, fill: C.text }),
    textLines(36, 332, ["Gunakan email atau nomor HP yang terdaftar pada tenant Anda."], { size: 12, weight: 600, fill: C.muted }),
    input(36, 372, 288, 48, "Email atau nomor HP", "owner@demo.local"),
    input(36, 452, 288, 48, "Kata sandi", "........"),
    pill(36, 526, 78, 30, "API Online", "#edf9f1", "#bfe7cf", C.success),
    textLines(324, 545, ["Lupa password?"], { size: 11, weight: 700, fill: C.info, anchor: "end" }),
    button(36, 572, 288, 52, "Masuk Sekarang"),
    button(36, 636, 288, 48, "Masuk dengan Biometrik", { fill: "#eef8ff", stroke: C.borderStrong, color: C.info }),
    rect(18, 724, 324, 58, C.surfaceSoft, C.border, 20, 1),
    rect(34, 739, 28, 28, C.primarySoft, "none", 10, 0),
    textLines(48, 758, ["i"], { size: 12, weight: 800, fill: C.text, anchor: "middle" }),
    textLines(76, 748, ["Akses cepat untuk owner, admin, cashier, worker, dan courier"], { size: 11, weight: 800, fill: C.text }),
    textLines(76, 764, ["Setelah login, aplikasi akan meminta outlet aktif."], { size: 10, weight: 600, fill: C.muted }),
  ];
  return svg("Login", gradients(), body.join(""));
}

function screenOutlet() {
  const body = [
    rect(18, 18, 324, 226, "url(#g-outlet)", "none", 30, 0),
    textLines(34, 56, ["Cuci"], { size: 27, weight: 800, fill: "#ffffff" }),
    textLines(34, 74, ["PILIH OUTLET AKTIF"], { size: 12, weight: 700, fill: "rgba(255,255,255,0.86)", letterSpacing: 1 }),
    textLines(34, 116, ["Outlet aktif menentukan konteks transaksi, status", "layanan, dan quick action selama sesi berjalan."], { size: 13, weight: 600, fill: "rgba(255,255,255,0.86)", lineHeight: 19 }),
    pill(34, 184, 80, 30, "Plan PRO", "rgba(255,255,255,0.14)", "rgba(255,255,255,0.18)", "#ffffff"),
    pill(122, 184, 72, 30, "3 outlet", "rgba(255,255,255,0.14)", "rgba(255,255,255,0.18)", "#ffffff"),
    rect(18, 258, 324, 132, C.surface, C.border, 24, 1),
    textLines(36, 288, ["Ahmad Fauzi"], { size: 18, weight: 800, fill: C.text }),
    textLines(36, 306, ["Role: owner, admin, cashier"], { size: 12, weight: 600, fill: C.muted }),
    pill(230, 274, 94, 30, "Order aktif", "#edf9f1", "#bfe7cf", C.success),
    textLines(36, 338, ["214/5000 order bulan ini"], { size: 12, weight: 700, fill: C.text2 }),
    rect(36, 352, 288, 10, "#edf5fd", "none", 999, 0),
    rect(36, 352, 92, 10, C.primaryStrong, "none", 999, 0),
    textLines(18, 424, ["Pilih outlet kerja"], { size: 13, weight: 800, fill: C.text }),
    textLines(18, 440, ["Tap satu outlet untuk masuk ke dashboard operasional."], { size: 11, weight: 600, fill: C.muted }),
    rect(18, 470, 324, 116, C.surface, "#8bd1f2", 22, 1),
    textLines(34, 500, ["BL-01 - Laundry Poin Dago"], { size: 15, weight: 800, fill: C.text }),
    pill(264, 486, 60, 30, "Aktif", "#edf9f1", "#bfe7cf", C.success),
    textLines(34, 522, ["Timezone: Asia/Jakarta"], { size: 11, weight: 700, fill: C.text2 }),
    textLines(34, 544, ["Outlet ini sedang digunakan untuk seluruh transaksi Anda."], { size: 12, weight: 600, fill: C.muted }),
    rect(18, 598, 324, 116, C.surface, C.border, 22, 1),
    textLines(34, 628, ["BL-02 - Laundry Poin Setiabudi"], { size: 15, weight: 800, fill: C.text }),
    pill(264, 614, 60, 30, "Pilih", C.surfaceSoft, C.border, C.text2),
    textLines(34, 650, ["Timezone: Asia/Jakarta"], { size: 11, weight: 700, fill: C.text2 }),
    textLines(34, 672, ["Tap untuk memilih outlet ini sebagai konteks kerja."], { size: 12, weight: 600, fill: C.muted }),
    button(18, 734, 324, 48, "Logout Akun", { fill: C.surface, stroke: C.border, color: C.text }),
  ];
  return svg("Outlet Select", gradients(), body.join(""));
}

function screenHomeDefault() {
  const body = [
    heroBlue("g-home", ["Beranda outlet lebih fokus."], "Laundry Poin Dago - shift pagi - 3 prioritas aktif", 42, "order aktif", "Rp 3,2jt", "cash hari ini", "Shift Pagi", "OPERASIONAL HARI INI"),
    rect(18, 220, 324, 84, C.surface, C.border, 24, 1),
    textLines(34, 248, ["Butuh tindakan sekarang"], { size: 13, weight: 800, fill: C.text }),
    textLines(34, 270, ["3 pickup perlu konfirmasi sebelum 10:00"], { size: 12, weight: 700, fill: C.text2 }),
    textLines(34, 288, ["Kasir dan kurir perlu follow up alamat + jadwal."], { size: 11, weight: 600, fill: C.muted }),
    button(238, 244, 88, 38, "Buka board", { fill: "#eef8ff", stroke: C.borderStrong, color: C.info }),
    compactMetricCard(18, 318, 157, 92, 17, "Perlu aksi", "warning"),
    compactMetricCard(185, 318, 157, 92, 9, "Belum lunas", "danger"),
    compactMetricCard(18, 424, 157, 92, 8, "Pickup hari ini", "info"),
    compactMetricCard(185, 424, 157, 92, 4786, "Sisa kuota", "success"),
    rect(18, 532, 324, 116, "url(#g-dark-panel)", "none", 24, 0),
    textLines(34, 560, ["Lane kerja hari ini"], { size: 13, weight: 800, fill: "#ffffff" }),
    textLines(304, 560, ["Live"], { size: 11, weight: 700, fill: "rgba(255,255,255,0.74)", anchor: "end" }),
    laneCard(34, 574, "Antrian", 8, C.primary),
    laneCard(134, 574, "Proses", 11, "#66d4ff"),
    laneCard(234, 574, "Siap", 7, "#6ce2b4"),
    rect(18, 662, 324, 38, C.surface, C.border, 19, 1),
    textLines(34, 686, ["Piutang aktif Rp 820rb"], { size: 12, weight: 800, fill: C.text }),
    pill(248, 667, 76, 28, "9 invoice", "#fff4de", "#f1d6a5", C.warning),
    bottomTab("Beranda"),
  ];
  return svg("Home Default", gradients(), body.join(""));
}

function screenHomeCommand() {
  const body = [
    heroBlue("g-command", ["Semua aksi penting ada di sini."], "Outlet Dago - shift pagi - 3 aksi prioritas aktif", 3, "butuh tindakan", "Rp 820rb", "piutang aktif", "09:22 Live", "ALT A - COMMAND CENTER"),
    rect(18, 242, 324, 184, C.surface, C.border, 24, 1),
    textLines(34, 270, ["Butuh tindakan sekarang"], { size: 13, weight: 800, fill: C.text }),
    textLines(308, 270, ["Buka board"], { size: 11, weight: 700, fill: C.info, anchor: "end" }),
    rect(34, 288, 292, 54, "#fff4de", "#f1d6a5", 18, 1),
    textLines(48, 312, ["3 order menunggu konfirmasi pickup"], { size: 12, weight: 800, fill: C.text }),
    textLines(48, 330, ["Aksi kasir + kurir"], { size: 11, weight: 600, fill: C.muted }),
    textLines(306, 321, ["Tindak"], { size: 11, weight: 800, fill: C.warning, anchor: "end" }),
    rect(34, 352, 292, 54, "#ffe8ed", "#f3c1cd", 18, 1),
    textLines(48, 376, ["9 tagihan belum lunas"], { size: 12, weight: 800, fill: C.text }),
    textLines(48, 394, ["Nilai total Rp 820rb"], { size: 11, weight: 600, fill: C.muted }),
    textLines(306, 385, ["Bayar"], { size: 11, weight: 800, fill: C.danger, anchor: "end" }),
  ];
  return svg("Home Alt Command Center", gradients(), body.join(""));
}

function screenHomeUrgent() {
  const body = [
    heroBlue("g-urgent", ["Prioritaskan yang paling mendesak."], "Pickup telat, payment due, dan delivery terdekat", 2, "pickup telat", 3, "payment due", "5 urgent", "ALT B - URGENT FIRST"),
    rect(18, 214, 324, 246, C.surface, C.border, 24, 1),
    textLines(34, 242, ["Urutan prioritas"], { size: 13, weight: 800, fill: C.text }),
    constUrgentCard(34, 258, "#fff1f4", "#f0bbc5", "Pickup telat 27 menit", "#1", "INV-0040 - Dipatiukur 31", C.danger),
    constUrgentCard(34, 322, "#fff4de", "#f1d6a5", "Tagihan due hari ini", "#2", "3 invoice - total Rp 320rb", C.warning),
    constUrgentCard(34, 386, "#eef8ff", "#bfd8ec", "Siap antar 45 menit", "#3", "2 alamat perlu verifikasi", C.info),
    rect(18, 476, 324, 176, C.surface, C.border, 24, 1),
    textLines(34, 504, ["Timeline 2 jam ke depan"], { size: 13, weight: 800, fill: C.text }),
    timelineRow(34, 528, C.danger, "09:30 follow up pickup telat", "Kurir belum assigned"),
    timelineRow(34, 568, C.warning, "10:00 reminder pelunasan", "3 invoice due hari ini"),
    timelineRow(34, 608, C.info, "10:20 cek order siap antar", "2 alamat butuh verifikasi"),
    button(18, 666, 140, 50, "Mulai tindak", { fill: "#c93d4f" }),
    button(168, 666, 174, 50, "Lihat semua", { fill: C.surface, stroke: C.border, color: C.text }),
    bottomTab("Beranda", "#c93d4f"),
  ];
  return svg("Home Alt Urgent First", gradients(), body.join(""));
}

function screenHomeRole() {
  const body = [
    heroBlue("g-role", ["Beranda berubah mengikuti peran kerja."], "Mode kasir aktif di outlet Dago", 8, "antrian kasir", 4, "bayar sekarang", "Kasir", "ALT C - ROLE-ADAPTIVE"),
    rect(18, 242, 324, 140, C.surface, C.border, 24, 1),
    textLines(34, 270, ["Pilih mode kerja"], { size: 13, weight: 800, fill: C.text }),
    button(34, 286, 141, 38, "Kasir", { fill: C.primaryStrong }),
    button(185, 286, 141, 38, "Worker", { fill: C.surface, stroke: C.border, color: C.text2 }),
    button(34, 336, 141, 38, "Kurir", { fill: C.surface, stroke: C.border, color: C.text2 }),
    button(185, 336, 141, 38, "Owner", { fill: C.surface, stroke: C.border, color: C.text2 }),
  ];
  return svg("Home Alt Role Adaptive", gradients(), body.join(""));
}

function orderCard(x, y, invoice, summary, status, statusFill, statusColor, total, due, meta) {
  return [
    rect(x, y, 324, 142, C.surface, C.border, 22, 1),
    textLines(x + 16, y + 28, [invoice], { size: 15, weight: 800, fill: C.text }),
    textLines(x + 16, y + 48, [summary], { size: 12, weight: 700, fill: C.text2 }),
    pill(x + 246, y + 16, 62, 28, status, statusFill, C.borderStrong, statusColor),
    textLines(x + 16, y + 86, ["Total"], { size: 11, weight: 700, fill: C.muted }),
    textLines(x + 16, y + 108, [total], { size: 18, weight: 800, fill: C.text }),
    textLines(x + 226, y + 86, ["Sisa bayar"], { size: 11, weight: 700, fill: C.muted }),
    textLines(x + 308, y + 108, [due], { size: 15, weight: 800, fill: due === "Lunas" ? C.success : C.danger, anchor: "end" }),
    textLines(x + 16, y + 132, [meta], { size: 11, weight: 600, fill: C.muted }),
  ].join("");
}

function screenOrders() {
  const body = [
    textLines(18, 42, ["Pesanan hari ini"], { size: 24, weight: 800, fill: C.text }),
    textLines(18, 62, ["42 pesanan aktif - outlet Dago"], { size: 12, weight: 600, fill: C.muted }),
    pill(266, 24, 76, 30, "17 Maret", "#eef8ff", C.borderStrong, C.info),
    rect(18, 86, 324, 48, C.surface, C.border, 16, 1),
    textLines(32, 116, ["Cari invoice, pelanggan, atau nomor HP"], { size: 13, weight: 600, fill: "#9ab1c7" }),
    pill(18, 146, 62, 32, "Semua", C.primaryStrong, C.primaryStrong, "#ffffff"),
    pill(88, 146, 68, 32, "Antrian", C.surface, C.border, C.text2),
    pill(164, 146, 60, 32, "Proses", C.surface, C.border, C.text2),
    pill(232, 146, 88, 32, "Siap ambil", C.surface, C.border, C.text2),
    orderCard(18, 192, "INV-DGO-250317-0042", "Nadia Putri - Cuci Lipat 4 kg", "Antrian", "#eef8ff", C.info, "Rp 128.000", "Rp 48.000", "09:12 - Pickup besok 10:00 - 2 item"),
    orderCard(18, 346, "INV-DGO-250317-0041", "Rizky Maulana - Setrika Express", "Proses", "#fff4de", C.warning, "Rp 76.000", "Lunas", "08:46 - Ready 15:00 - 1 item"),
    rect(18, 500, 324, 44, C.surfaceSoft, C.border, 18, 1),
    textLines(34, 528, ["42 order - 17 perlu aksi - scroll untuk lebih banyak"], { size: 12, weight: 700, fill: C.text2 }),
    bottomTab("Pesanan"),
  ];
  return svg("Orders", gradients(), body.join(""));
}

function createHeader(stepNumber, title, subtitle) {
  return [
    textLines(18, 42, [title], { size: 24, weight: 800, fill: C.text }),
    textLines(18, 62, [subtitle], { size: 12, weight: 600, fill: C.muted }),
    rect(304, 20, 38, 38, C.surface, C.border, 14, 1),
    stepTrack(18, 86, stepNumber),
  ].join("");
}

function stepTrack(x, y, activeStep) {
  const labels = ["1. Pelanggan", "2. Layanan", "3. Review"];
  const parts = [];
  labels.forEach((label, idx) => {
    const step = idx + 1;
    const itemX = x + idx * 106;
    parts.push(rect(itemX, y, 98, 6, step <= activeStep ? (step === activeStep ? C.info : C.primaryStrong) : C.border, "none", 999, 0));
    parts.push(textLines(itemX, y + 24, [label], { size: 11, weight: 800, fill: step === activeStep ? C.info : C.text }));
  });
  return parts.join("");
}

function screenStep1() {
  const body = [
    createHeader(1, "Tambah pesanan", "Langkah 1 - pilih pelanggan dan kebutuhan pickup/delivery"),
    rect(18, 132, 324, 48, C.surface, C.border, 16, 1),
    textLines(32, 162, ["Cari pelanggan, nomor HP, atau tambah baru"], { size: 13, weight: 600, fill: "#9ab1c7" }),
    rect(18, 194, 324, 148, C.surface, C.border, 24, 1),
    textLines(34, 222, ["Pelanggan terpilih"], { size: 13, weight: 800, fill: C.text }),
    textLines(34, 248, ["Nadia Putri"], { size: 18, weight: 800, fill: C.text }),
    textLines(34, 268, ["+62 812-3456-7788 - Member reguler"], { size: 12, weight: 600, fill: C.muted }),
    pill(242, 208, 82, 30, "2 paket aktif", "#edf9f1", "#bfe7cf", C.success),
    pill(34, 292, 120, 32, "Pickup besok 10:00", "#eef8ff", C.borderStrong, C.info),
    pill(162, 292, 102, 32, "Delivery aktif", "#eef8ff", C.borderStrong, C.info),
    rect(18, 356, 324, 92, C.surface, C.border, 24, 1),
    textLines(34, 384, ["Data paket"], { size: 13, weight: 800, fill: C.text }),
    textLines(34, 406, ["2 paket aktif - sisa kuota 3 kg - prioritas cuci lipat"], { size: 12, weight: 600, fill: C.text2 }),
    rect(18, 462, 324, 172, C.surface, C.border, 24, 1),
    textLines(34, 490, ["Pickup & pengantaran"], { size: 13, weight: 800, fill: C.text }),
    pill(34, 506, 92, 30, "Pickup", C.primaryStrong, C.primaryStrong, "#ffffff"),
    pill(134, 506, 92, 30, "Delivery", C.surface, C.border, C.text2),
    input(34, 556, 288, 46, "Jadwal pickup", "18 Mar 2026 - 10:00"),
    input(34, 620, 288, 46, "Alamat pickup", "Jl. Dago Asri No. 18, Bandung"),
    button(18, 724, 152, 52, "Kembali", { fill: C.surface, stroke: C.border, color: C.text }),
    button(182, 724, 160, 52, "Lanjut ke layanan"),
  ];
  return svg("Order Create Step 1", gradients(), body.join(""));
}

function serviceCard(x, y, title, price, qty, meta) {
  return [
    rect(x, y, 324, 106, C.surface, C.border, 24, 1),
    textLines(x + 16, y + 28, [title], { size: 15, weight: 800, fill: C.text }),
    textLines(x + 16, y + 48, [price], { size: 12, weight: 700, fill: C.text2 }),
    pill(x + 16, y + 64, 78, 28, qty, C.primarySoft, C.borderStrong, C.info),
    textLines(x + 108, y + 82, [meta], { size: 11, weight: 600, fill: C.muted }),
    rect(x + 264, y + 26, 24, 24, C.surfaceSoft, C.border, 8, 1),
    textLines(x + 276, y + 43, ["-"], { size: 14, weight: 800, fill: C.text, anchor: "middle" }),
    rect(x + 292, y + 26, 24, 24, C.surfaceSoft, C.border, 8, 1),
    textLines(x + 304, y + 43, ["+"], { size: 14, weight: 800, fill: C.text, anchor: "middle" }),
  ].join("");
}

function screenStep2() {
  const body = [
    createHeader(2, "Tambah pesanan", "Langkah 2 - pilih layanan, qty, dan item order"),
    rect(18, 132, 324, 48, C.surface, C.border, 16, 1),
    textLines(32, 162, ["Cari layanan, grup, atau parfum"], { size: 13, weight: 600, fill: "#9ab1c7" }),
    pill(18, 192, 64, 32, "Semua", C.primaryStrong, C.primaryStrong, "#ffffff"),
    pill(90, 192, 70, 32, "Kiloan", C.surface, C.border, C.text2),
    pill(168, 192, 70, 32, "Satuan", C.surface, C.border, C.text2),
    pill(246, 192, 78, 32, "Express", C.surface, C.border, C.text2),
    serviceCard(18, 240, "Cuci Lipat", "Rp 17.000 / kg", "4 kg", "Ocean Fresh"),
    serviceCard(18, 360, "Setrika Express", "Rp 21.000 / pcs", "2 pcs", "Selesai 6 jam"),
    rect(18, 488, 324, 150, C.surface, C.border, 24, 1),
    textLines(34, 516, ["Item terpilih"], { size: 13, weight: 800, fill: C.text }),
    textLines(304, 516, ["Tambah item"], { size: 11, weight: 700, fill: C.info, anchor: "end" }),
    rect(34, 534, 292, 40, C.surfaceSoft, C.border, 14, 1),
    textLines(46, 558, ["Cuci Lipat - 4 kg - parfum Ocean Fresh"], { size: 12, weight: 700, fill: C.text2 }),
    rect(34, 582, 292, 40, C.surfaceSoft, C.border, 14, 1),
    textLines(46, 606, ["Setrika Express - 2 pcs - selesai 6 jam"], { size: 12, weight: 700, fill: C.text2 }),
    button(18, 724, 152, 52, "Kembali", { fill: C.surface, stroke: C.border, color: C.text }),
    button(182, 724, 160, 52, "Lanjut ke review"),
  ];
  return svg("Order Create Step 2", gradients(), body.join(""));
}

function summaryRow(x, y, label, value, color = "#ffffff") {
  return [
    textLines(x, y, [label], { size: 11, weight: 700, fill: "rgba(255,255,255,0.74)" }),
    textLines(324, y, [value], { size: 12, weight: 800, fill: color, anchor: "end" }),
  ].join("");
}

function screenStep3() {
  const body = [
    createHeader(3, "Tambah pesanan", "Langkah 3 - review, promo, ongkir, dan pembayaran"),
    rect(18, 132, 324, 104, C.surface, C.border, 24, 1),
    textLines(34, 160, ["Pelanggan & item"], { size: 13, weight: 800, fill: C.text }),
    textLines(34, 186, ["Nadia Putri - 2 item - pickup 18 Mar 10:00"], { size: 12, weight: 700, fill: C.text2 }),
    textLines(34, 206, ["Cuci Lipat 4 kg + Setrika Express 2 pcs"], { size: 12, weight: 600, fill: C.muted }),
    rect(18, 250, 324, 176, C.surface, C.border, 24, 1),
    textLines(34, 278, ["Promo & penyesuaian"], { size: 13, weight: 800, fill: C.text }),
    input(34, 308, 288, 42, "Kode voucher", "PROMO2K"),
    input(34, 366, 136, 42, "Ongkir", "20000"),
    input(186, 366, 136, 42, "Diskon manual", "0"),
    rect(18, 440, 324, 214, "url(#g-dark-panel)", "none", 24, 0),
    textLines(34, 468, ["Ringkasan review"], { size: 12, weight: 700, fill: "rgba(255,255,255,0.76)" }),
    textLines(34, 500, ["Rp 128.000"], { size: 24, weight: 800, fill: "#ffffff" }),
    pill(228, 456, 96, 30, "Bayar sekarang", "rgba(255,255,255,0.12)", "rgba(255,255,255,0.16)", "#ffffff"),
    summaryRow(34, 534, "Subtotal", "Rp 110.000"),
    summaryRow(34, 560, "Ongkir", "Rp 20.000"),
    summaryRow(34, 586, "Promo voucher", "- Rp 2.000", C.primary),
    summaryRow(34, 618, "Metode", "Tunai"),
    button(34, 654, 290, 48, "Simpan & lanjut ke pembayaran", { fill: C.primary, color: "#06233c" }),
    button(18, 724, 152, 52, "Kembali", { fill: C.surface, stroke: C.border, color: C.text }),
    button(182, 724, 160, 52, "Simpan pesanan"),
  ];
  return svg("Order Create Step 3", gradients(), body.join(""));
}

function screenOrderDetail() {
  const body = [
    textLines(18, 42, ["INV-DGO-250317-0042"], { size: 12, weight: 700, fill: C.muted }),
    textLines(18, 66, ["Detail pesanan"], { size: 24, weight: 800, fill: C.text }),
    textLines(18, 84, ["Pickup besok 10:00 - dibuat 09:12"], { size: 12, weight: 600, fill: C.muted }),
    pill(270, 28, 54, 28, "Proses", "#fff4de", "#f1d6a5", C.warning),
    rect(18, 106, 157, 78, C.surface, C.border, 22, 1),
    rect(185, 106, 157, 78, C.surface, C.border, 22, 1),
    textLines(34, 132, ["Total tagihan"], { size: 11, weight: 700, fill: C.muted }),
    textLines(34, 160, ["Rp 128.000"], { size: 24, weight: 800, fill: C.text }),
    textLines(201, 132, ["Sisa bayar"], { size: 11, weight: 700, fill: C.muted }),
    textLines(201, 160, ["Rp 48.000"], { size: 24, weight: 800, fill: C.danger }),
    rect(18, 198, 324, 126, C.surface, C.border, 24, 1),
    textLines(34, 226, ["Pelanggan & pengantaran"], { size: 13, weight: 800, fill: C.text }),
    textLines(34, 252, ["Nadia Putri"], { size: 18, weight: 800, fill: C.text }),
    textLines(34, 272, ["+62 812-3456-7788 - Jl. Dago Asri No. 18, Bandung"], { size: 12, weight: 600, fill: C.muted }),
    pill(34, 286, 124, 30, "Customer WA ready", "#edf9f1", "#bfe7cf", C.success),
    pill(166, 286, 96, 30, "Delivery aktif", "#eef8ff", C.borderStrong, C.info),
    rect(18, 338, 324, 232, C.surface, C.border, 24, 1),
    textLines(34, 366, ["Item layanan"], { size: 13, weight: 800, fill: C.text }),
    rect(34, 384, 292, 54, C.surfaceSoft, C.border, 18, 1),
    textLines(48, 408, ["Cuci Lipat - 4 kg - parfum Ocean Fresh"], { size: 12, weight: 700, fill: C.text2 }),
    textLines(306, 408, ["Rp 68.000"], { size: 12, weight: 800, fill: C.text, anchor: "end" }),
    rect(34, 446, 292, 54, C.surfaceSoft, C.border, 18, 1),
    textLines(48, 470, ["Setrika Express - 2 pcs - 6 jam"], { size: 12, weight: 700, fill: C.text2 }),
    textLines(306, 470, ["Rp 42.000"], { size: 12, weight: 800, fill: C.text, anchor: "end" }),
    rect(34, 514, 292, 40, "#fff4de", "#f1d6a5", 18, 1),
    textLines(48, 538, ["Status pembayaran: Belum lunas - DP Rp 80.000"], { size: 12, weight: 700, fill: C.text2 }),
    rect(18, 586, 324, 118, C.surface, C.border, 24, 1),
    button(34, 602, 136, 46, "Update status", { fill: "#eef8ff", stroke: C.borderStrong, color: C.info }),
    button(190, 602, 136, 46, "Cetak nota", { fill: "#eef8ff", stroke: C.borderStrong, color: C.info }),
    button(34, 656, 136, 46, "Kirim WA", { fill: C.surface, stroke: C.border, color: C.text }),
    button(190, 656, 136, 46, "Tambah pembayaran"),
  ];
  return svg("Order Detail", gradients(), body.join(""));
}

function methodCard(x, y, title, subtitle, active) {
  return [
    rect(x, y, 86, 68, active ? "#eef8ff" : C.surface, active ? "#82dffc" : C.border, 18, 1),
    textLines(x + 14, y + 28, [title], { size: 12, weight: 800, fill: C.text }),
    textLines(x + 14, y + 46, [subtitle], { size: 11, weight: 600, fill: C.muted }),
  ].join("");
}

function screenPayment() {
  const body = [
    textLines(18, 42, ["Pembayaran order"], { size: 12, weight: 700, fill: C.muted }),
    textLines(18, 66, ["INV-DGO-250317-0042"], { size: 24, weight: 800, fill: C.text }),
    textLines(18, 84, ["Mode pembayaran + preview nota"], { size: 12, weight: 600, fill: C.muted }),
    pill(250, 28, 92, 30, "Rp 48.000 sisa", "#ffe8ed", "#f3c1cd", C.danger),
    rect(18, 106, 324, 124, "url(#g-dark-panel)", "none", 24, 0),
    textLines(34, 134, ["Nominal yang dibayar"], { size: 11, weight: 700, fill: "rgba(255,255,255,0.74)" }),
    textLines(34, 176, ["Rp 48.000"], { size: 34, weight: 800, fill: "#ffffff" }),
    textLines(34, 200, ["Sisa setelah transaksi ini: Rp 0"], { size: 12, weight: 600, fill: "rgba(255,255,255,0.78)" }),
    rect(18, 244, 324, 174, C.surface, C.border, 24, 1),
    textLines(34, 272, ["Metode pembayaran"], { size: 13, weight: 800, fill: C.text }),
    methodCard(34, 288, "Tunai", "Instan", true),
    methodCard(136, 288, "Transfer", "Manual", false),
    methodCard(238, 288, "QRIS", "Gateway", false),
    rect(34, 368, 288, 36, "#f5fbff", C.borderStrong, 14, 1),
    textLines(48, 392, ["Nominal input: 48.000"], { size: 13, weight: 700, fill: C.text }),
    rect(18, 432, 324, 206, C.surface, C.border, 24, 1),
    textLines(34, 460, ["Preview nota"], { size: 13, weight: 800, fill: C.text }),
    pill(264, 446, 60, 28, "58 mm", C.surfaceSoft, C.border, C.text2),
    rect(34, 480, 288, 98, C.surfaceSoft, C.border, 18, 1),
    textLines(48, 502, ["Laundry Poin Dago"], { size: 11, weight: 800, fill: C.text }),
    textLines(48, 520, ["INV-DGO-250317-0042"], { size: 10, weight: 700, fill: C.muted }),
    line(48, 530, 308, 530, C.border, 1),
    textLines(48, 548, ["Cuci Lipat 4 kg"], { size: 10, weight: 700, fill: C.text2 }),
    textLines(48, 564, ["Setrika Express 2 pcs"], { size: 10, weight: 700, fill: C.text2 }),
    line(48, 572, 308, 572, C.border, 1),
    textLines(48, 590, ["Total 128.000 - Bayar 48.000"], { size: 10, weight: 800, fill: C.text }),
    button(34, 610, 136, 42, "Cetak", { fill: "#eef8ff", stroke: C.borderStrong, color: C.info }),
    button(186, 610, 136, 42, "Bagikan", { fill: C.surface, stroke: C.border, color: C.text }),
    button(18, 724, 324, 52, "Simpan pembayaran"),
  ];
  return svg("Payment", gradients(), body.join(""));
}

function menuRow(x, y, title, subtitle) {
  return [
    line(x, y + 42, x + 292, y + 42, "#eef4fa", 1),
    textLines(x, y + 18, [title], { size: 14, weight: 800, fill: C.text }),
    textLines(x, y + 36, [subtitle], { size: 11, weight: 600, fill: C.muted }),
    textLines(x + 292, y + 28, ["Buka"], { size: 11, weight: 700, fill: C.info, anchor: "end" }),
  ].join("");
}

function screenAccount() {
  const body = [
    rect(18, 18, 324, 162, "#ebf9ff", C.borderStrong, 28, 1),
    rect(34, 36, 54, 54, "#d5efff", C.borderStrong, 20, 1),
    rect(47, 49, 28, 28, C.primaryStrong, "none", 10, 0),
    textLines(102, 58, ["Ahmad Fauzi"], { size: 18, weight: 800, fill: C.text }),
    textLines(102, 76, ["Owner - Laundry Poin Dago"], { size: 12, weight: 600, fill: C.muted }),
    pill(34, 106, 96, 28, "Biometrik aktif", C.surface, C.border, C.info),
    pill(138, 106, 84, 28, "Order aktif", "#edf9f1", "#bfe7cf", C.success),
    textLines(34, 154, ["Outlet aktif: BL-01 - Laundry Poin Dago - Plan PRO"], { size: 12, weight: 600, fill: C.text2 }),
    rect(18, 194, 324, 222, C.surface, C.border, 24, 1),
    textLines(34, 222, ["Operasional"], { size: 13, weight: 800, fill: C.text }),
    menuRow(34, 244, "Pelanggan", "List, detail, dan paket pelanggan"),
    menuRow(34, 294, "Layanan & produk", "Harga, group, variant, promo"),
    menuRow(34, 344, "Printer & nota", "Logo, format, device printer"),
    rect(18, 430, 324, 222, C.surface, C.border, 24, 1),
    textLines(34, 458, ["Bisnis & sistem"], { size: 13, weight: 800, fill: C.text }),
    menuRow(34, 480, "Keuangan", "Quota billing dan kas operasional"),
    menuRow(34, 530, "WhatsApp tools", "Provider, status, dan riwayat pesan"),
    menuRow(34, 580, "Bantuan", "FAQ, support, dan reset cache"),
    button(18, 666, 154, 48, "Ganti outlet", { fill: "#eef8ff", stroke: C.borderStrong, color: C.info }),
    button(188, 666, 154, 48, "Logout", { fill: C.surface, stroke: C.border, color: C.text }),
    bottomTab("Akun"),
  ];
  return svg("Account", gradients(), body.join(""));
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const files = [
    ["00-foundations.svg", screenFoundations()],
    ["01-login.svg", screenLogin()],
    ["02-outlet-select.svg", screenOutlet()],
    ["03-home-default.svg", screenHomeDefault()],
    ["04-home-alt-command-center.svg", screenHomeCommand()],
    ["05-home-alt-urgent-first.svg", screenHomeUrgent()],
    ["06-home-alt-role-adaptive.svg", screenHomeRole()],
    ["07-orders.svg", screenOrders()],
    ["08-order-create-step-1-customer.svg", screenStep1()],
    ["09-order-create-step-2-services.svg", screenStep2()],
    ["10-order-create-step-3-review.svg", screenStep3()],
    ["11-order-detail.svg", screenOrderDetail()],
    ["12-payment.svg", screenPayment()],
    ["13-account.svg", screenAccount()],
  ];

  for (const [filename, content] of files) {
    await writeFile(path.join(OUT_DIR, filename), content, "utf8");
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    width: WIDTH,
    height: HEIGHT,
    fonts: ["Manrope"],
    files: files.map(([filename]) => filename),
  };

  await writeFile(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`Generated ${files.length} SVG screens in ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
