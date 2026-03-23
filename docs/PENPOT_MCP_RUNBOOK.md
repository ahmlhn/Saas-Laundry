# Penpot MCP Runbook

Dokumen ini menyimpan langkah menjalankan server MCP Penpot lokal yang dipakai Codex.

## Lokasi Server

- Source MCP server: `C:\Users\ahmlh\penpot-mcp`
- Plugin manifest lokal: `http://localhost:4400/manifest.json`
- Endpoint MCP untuk Codex: `http://localhost:4401/mcp`
- WebSocket plugin ke server: `ws://localhost:4402`

## Start Server

Jalankan dari PowerShell:

```powershell
cd C:\Users\ahmlh\penpot-mcp
npm run start:all
```

Kalau ini adalah mesin baru atau dependency belum ada, jalankan sekali:

```powershell
cd C:\Users\ahmlh\penpot-mcp
npm install
npm run install:all
npm run build:all
```

## Verifikasi Server

Cek port lokal:

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -in 4400,4401,4402,4403 }
```

Port yang normal:

- `4400` untuk plugin server
- `4401` untuk HTTP MCP endpoint
- `4402` untuk WebSocket plugin bridge
- `4403` untuk REPL debug

## Hubungkan Ke Codex

Tambahkan endpoint ke Codex sekali saja:

```powershell
codex mcp add penpot --url http://localhost:4401/mcp
```

Cek hasilnya:

```powershell
codex mcp list
```

Status yang diharapkan:

- `penpot  http://localhost:4401/mcp  enabled`

## Hubungkan Ke Penpot

Server MCP belum cukup. File desain Penpot harus membuka plugin MCP juga.

1. Buka Penpot di browser dan masuk ke file desain
2. Buka menu `Plugins`
3. Load plugin dari URL `http://localhost:4400/manifest.json`
4. Buka UI plugin
5. Klik `Connect to MCP server`
6. Approve izin akses `localhost` jika browser meminta
7. Jangan tutup UI plugin selama Codex dipakai

## Troubleshooting

Kalau Codex sudah melihat server tapi tidak bisa mengubah canvas:

- pastikan plugin Penpot sedang terbuka di file desain
- pastikan tombol plugin menunjukkan status connected
- pastikan browser tidak memblokir akses `localhost`
- restart server dengan menutup proses lama lalu jalankan lagi `npm run start:all`
- buka chat Codex baru setelah koneksi aktif

Kalau perlu cek server hidup atau tidak:

```powershell
codex mcp get penpot
```

Kalau perlu cek plugin server:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:4400/manifest.json
```

## Catatan

- Penpot Desktop lokal tidak otomatis mengekspos MCP endpoint.
- Jalur yang dipakai sekarang adalah server MCP lokal + plugin Penpot.
- Repo referensi MCP yang dipakai ada di `C:\Users\ahmlh\penpot-mcp`.
