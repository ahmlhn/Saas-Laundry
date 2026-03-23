export const WIDTH = 360;
export const HEIGHT = 800;

export const C = {
  bg: "#f2f8ff",
  bgStrong: "#e9f2ff",
  surface: "#ffffff",
  surfaceSoft: "#f7fbff",
  border: "#d8e6f3",
  borderStrong: "#bfd8ec",
  text: "#0a2b49",
  text2: "#385f80",
  muted: "#6f8ba4",
  primary: "#1cd3e2",
  primaryStrong: "#0ea4ce",
  primarySoft: "#d9f8ff",
  info: "#2a7ce2",
  success: "#1f9e63",
  warning: "#dd8c10",
  danger: "#ce3d52",
  darkBlue: "#0d365f",
};

export function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function svg(name, defs, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" fill="none">
  <title>${esc(name)}</title>
  <defs>
    <style>
      .f-r { font-family: Manrope, Arial, sans-serif; font-weight: 500; }
      .f-sb { font-family: Manrope, Arial, sans-serif; font-weight: 700; }
      .f-b { font-family: Manrope, Arial, sans-serif; font-weight: 800; }
    </style>
    ${defs}
  </defs>
  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${C.bg}" />
  ${body}
</svg>
`;
}

export function rect(x, y, w, h, fill, stroke = "none", rx = 0, strokeWidth = 1, opacity = 1) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
}

export function line(x1, y1, x2, y2, stroke, strokeWidth = 1, opacity = 1) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" />`;
}

export function textLines(
  x,
  y,
  lines,
  { size = 13, weight = 500, fill = C.text, lineHeight = null, anchor = "start", letterSpacing = 0, opacity = 1 } = {},
) {
  const lh = lineHeight ?? Math.round(size * 1.25);
  const family = weight >= 800 ? "f-b" : weight >= 700 ? "f-sb" : "f-r";
  const spans = lines
    .map((lineText, idx) => {
      const dy = idx === 0 ? 0 : lh;
      return `<tspan x="${x}" dy="${dy}">${esc(lineText)}</tspan>`;
    })
    .join("");
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${fill}" opacity="${opacity}" letter-spacing="${letterSpacing}" class="${family}" style="font-size:${size}px">${spans}</text>`;
}

export function pill(x, y, w, h, label, fill, stroke, textColor) {
  return [
    rect(x, y, w, h, fill, stroke, h / 2, 1),
    textLines(x + w / 2, y + h / 2 + 4, [label], { size: 11, weight: 700, fill: textColor, anchor: "middle" }),
  ].join("");
}

export function button(x, y, w, h, label, { fill = C.primaryStrong, stroke = "none", color = "#ffffff" } = {}) {
  return [
    rect(x, y, w, h, fill, stroke, 16, 1),
    textLines(x + w / 2, y + h / 2 + 5, [label], { size: 13, weight: 800, fill: color, anchor: "middle" }),
  ].join("");
}

export function input(x, y, w, h, label, value, active = false) {
  return [
    textLines(x, y - 8, [label], { size: 11, weight: 700, fill: C.text2 }),
    rect(x, y, w, h, "#f5fbff", active ? C.info : C.borderStrong, 15, 1),
    textLines(x + 14, y + 30, [value], { size: 13, weight: 600, fill: value.includes("Cari") ? "#9ab1c7" : C.text }),
  ].join("");
}

export function metricCard(x, y, w, h, count, label, tone = "info") {
  const fills = {
    info: ["#eef8ff", C.info],
    warning: ["#fff4de", C.warning],
    success: ["#edf9f1", C.success],
    danger: ["#ffe8ed", C.danger],
  };
  const [chipFill, chipText] = fills[tone];
  return [
    rect(x, y, w, h, C.surface, C.border, 22, 1),
    rect(x + 14, y + 14, 34, 34, chipFill, "none", 12, 0),
    textLines(x + 31, y + 37, [String(count).padStart(2, "0")], { size: 12, weight: 800, fill: chipText, anchor: "middle" }),
    textLines(x + 14, y + 76, [String(count)], { size: 24, weight: 800, fill: C.text }),
    textLines(x + 14, y + 96, [label], { size: 11, weight: 700, fill: C.muted }),
  ].join("");
}

export function bottomTab(active = "Beranda", accent = C.primaryStrong) {
  const labels = ["Beranda", "Pesanan", "", "Laporan", "Akun"];
  const xPositions = [52, 118, 180, 242, 306];
  const parts = [rect(18, 705, 324, 77, "rgba(255,255,255,0.96)", C.border, 26, 1)];
  labels.forEach((label, idx) => {
    const x = xPositions[idx];
    if (idx === 2) {
      parts.push(rect(x - 27, 714, 54, 54, accent, "#ffffff", 27, 4));
      parts.push(rect(x - 10, 731, 20, 20, "#ffffff", "none", 6, 0));
      return;
    }
    const isActive = active === label;
    parts.push(rect(x - 12, 718, 24, 24, isActive ? C.info : C.border, "none", 8, 0));
    parts.push(textLines(x, 771, [label], { size: 11, weight: isActive ? 800 : 700, fill: isActive ? C.info : C.muted, anchor: "middle" }));
  });
  return parts.join("");
}

export function gradients() {
  return [
    `<linearGradient id="g-login" x1="18" y1="18" x2="342" y2="266" gradientUnits="userSpaceOnUse"><stop stop-color="#0e8ee0"/><stop offset="0.55" stop-color="#0b6fca"/><stop offset="1" stop-color="#0a4fa8"/></linearGradient>`,
    `<linearGradient id="g-outlet" x1="18" y1="18" x2="342" y2="244" gradientUnits="userSpaceOnUse"><stop stop-color="#1f86e4"/><stop offset="0.55" stop-color="#136fd0"/><stop offset="1" stop-color="#0b4ba7"/></linearGradient>`,
    `<linearGradient id="g-home" x1="18" y1="18" x2="342" y2="214" gradientUnits="userSpaceOnUse"><stop stop-color="#0c7ad4"/><stop offset="0.55" stop-color="#0ea4ce"/><stop offset="1" stop-color="#1cd3e2"/></linearGradient>`,
    `<linearGradient id="g-command" x1="18" y1="18" x2="342" y2="228" gradientUnits="userSpaceOnUse"><stop stop-color="#0d6fc7"/><stop offset="0.55" stop-color="#0ea4ce"/><stop offset="1" stop-color="#1cd3e2"/></linearGradient>`,
    `<linearGradient id="g-urgent" x1="18" y1="18" x2="342" y2="228" gradientUnits="userSpaceOnUse"><stop stop-color="#7d2131"/><stop offset="0.55" stop-color="#c93d4f"/><stop offset="1" stop-color="#f18b3a"/></linearGradient>`,
    `<linearGradient id="g-role" x1="18" y1="18" x2="342" y2="228" gradientUnits="userSpaceOnUse"><stop stop-color="#10395f"/><stop offset="0.55" stop-color="#136aa0"/><stop offset="1" stop-color="#1cd3e2"/></linearGradient>`,
    `<linearGradient id="g-dark-panel" x1="18" y1="520" x2="342" y2="760" gradientUnits="userSpaceOnUse"><stop stop-color="#0d365f"/><stop offset="1" stop-color="#113a66"/></linearGradient>`,
  ].join("");
}

export function heroBlue(id, titleLines, subtitle, leftMetric, leftLabel, rightMetric, rightLabel, badge = "Plan PRO", kicker = null) {
  const parts = [
    rect(18, 18, 324, 210, `url(#${id})`, "none", 30, 0),
    rect(260, 22, 72, 34, "rgba(255,255,255,0.16)", "rgba(255,255,255,0.2)", 17, 1),
    textLines(296, 43, [badge], { size: 11, weight: 700, fill: "#ffffff", anchor: "middle" }),
  ];
  if (kicker) {
    parts.push(textLines(34, 42, [kicker], { size: 11, weight: 800, fill: "rgba(255,255,255,0.84)", letterSpacing: 1 }));
    parts.push(textLines(34, 72, titleLines, { size: 24, weight: 800, fill: "#ffffff", lineHeight: 28 }));
    parts.push(textLines(34, 132, [subtitle], { size: 12, weight: 600, fill: "rgba(255,255,255,0.82)", lineHeight: 17 }));
  } else {
    parts.push(textLines(34, 46, titleLines, { size: 24, weight: 800, fill: "#ffffff", lineHeight: 28 }));
    parts.push(textLines(34, 98, [subtitle], { size: 12, weight: 600, fill: "rgba(255,255,255,0.82)", lineHeight: 17 }));
  }
  parts.push(line(116, 160, 116, 202, "rgba(255,255,255,0.22)", 1));
  parts.push(textLines(34, 178, [String(leftMetric)], { size: 32, weight: 800, fill: "#ffffff" }));
  parts.push(textLines(34, 201, [leftLabel], { size: 11, weight: 700, fill: "rgba(255,255,255,0.82)" }));
  parts.push(textLines(132, 178, [String(rightMetric)], { size: 32, weight: 800, fill: "#ffffff" }));
  parts.push(textLines(132, 201, [rightLabel], { size: 11, weight: 700, fill: "rgba(255,255,255,0.82)" }));
  return parts.join("");
}
