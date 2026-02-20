# Video Frames Tool

Tool Python reusable untuk ekstrak screenshot dari video secara otomatis berdasarkan interval waktu.

## Quick Start (Windows PowerShell)

```powershell
python -m venv .venv-tools
.venv-tools\Scripts\Activate.ps1
python -m pip install -r tools/video-frames/requirements.txt
```

## Pemakaian CLI

```powershell
python tools/video-frames/extract_frames.py --input "<path-video>"
```

Contoh dengan opsi lengkap:

```powershell
python tools/video-frames/extract_frames.py `
  --input "C:\Users\ahmlh\Downloads\Screenrecorder-2026-02-20-21-26-10-321.mp4" `
  --output "tmp/video-frames" `
  --interval 2 `
  --format png `
  --start 0 `
  --max-frames 20
```

Untuk ambil semua frame:

```powershell
python tools/video-frames/extract_frames.py `
  --input "C:\Users\ahmlh\Downloads\Screenrecorder-2026-02-20-21-26-10-321.mp4" `
  --every-frame `
  --format png
```

## Wrapper PowerShell

Wrapper `run.ps1` otomatis memakai `.venv-tools\Scripts\python.exe` jika tersedia.

```powershell
powershell -ExecutionPolicy Bypass -File tools/video-frames/run.ps1 `
  -InputPath "C:\Users\ahmlh\Downloads\Screenrecorder-2026-02-20-21-26-10-321.mp4"
```

Contoh dengan batas waktu:

```powershell
powershell -ExecutionPolicy Bypass -File tools/video-frames/run.ps1 `
  -InputPath "C:\Users\ahmlh\Downloads\Screenrecorder-2026-02-20-21-26-10-321.mp4" `
  -Interval 2 `
  -Start 10 `
  -End 50 `
  -MaxFrames 15
```

Ambil semua frame via wrapper:

```powershell
powershell -ExecutionPolicy Bypass -File tools/video-frames/run.ps1 `
  -InputPath "C:\Users\ahmlh\Downloads\Screenrecorder-2026-02-20-21-26-10-321.mp4" `
  -EveryFrame
```

## Output

Default output root:

- `tmp/video-frames`

Struktur hasil:

- `tmp/video-frames/<video-stem>/<timestamp>/frame_0001_t0002.000.png`
- `tmp/video-frames/<video-stem>/<timestamp>/manifest.json`

`manifest.json` berisi:

- path video sumber
- parameter run
- metadata video (fps, jumlah frame, durasi jika tersedia)
- daftar file frame yang dihasilkan

## Exit Codes

- `0`: sukses
- `2`: input/argumen tidak valid
- `3`: gagal decode video atau tidak ada frame yang berhasil diekstrak

## Troubleshooting

Jika muncul decode error:

1. Pastikan file video bisa diputar normal di media player.
2. Coba update dependency:
   `python -m pip install --upgrade opencv-python-headless`
3. Jika codec tertentu tetap gagal, install `ffmpeg` di mesin lalu gunakan ffmpeg sebagai fallback untuk ekstraksi frame.
   Contoh:
   `ffmpeg -i "<path-video>" -vf "fps=1/2" "tmp/video-frames/ffmpeg/frame_%04d.png"`
