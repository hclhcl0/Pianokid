# ============================================================
#  KidsPiano - Local Development Startup Script (No Docker)
#  Tác giả: Hồ Công Lượng <hclhcl0@gmail.com>
# ============================================================

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Definition
Write-Host ""
Write-Host "🎹  KidsPiano - Khởi động Local Dev..." -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor DarkGray

# ── 1. Kiểm tra PostgreSQL Service ───────────────────────────
Write-Host ""
Write-Host "▶ [1/4] Kiểm tra PostgreSQL Service..." -ForegroundColor Yellow
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
if ($pgService) {
    if ($pgService.Status -ne 'Running') {
        Start-Service $pgService.Name
        Write-Host "  ✅ PostgreSQL đã được khởi động: $($pgService.Name)" -ForegroundColor Green
    } else {
        Write-Host "  ✅ PostgreSQL đang chạy: $($pgService.Name)" -ForegroundColor Green
    }
} else {
    Write-Host "  ⚠️  Không tìm thấy PostgreSQL service!" -ForegroundColor Red
    Write-Host "  → Cài bằng: winget install PostgreSQL.PostgreSQL.15" -ForegroundColor Yellow
    exit 1
}
Start-Sleep -Seconds 2

# ── 2. Backend API (Node.js :3001) ────────────────────────────
Write-Host ""
Write-Host "▶ [2/4] Khởi động Backend API (port 3001)..." -ForegroundColor Yellow
Start-Process "powershell" -ArgumentList "-NoExit", "-Command", @"
  Set-Location '$ROOT\piano-backend'
  `$host.UI.RawUI.WindowTitle = '🗄️ Backend API :3001'
  Write-Host '🗄️  Backend API - localhost:3001' -ForegroundColor Cyan
  Write-Host '─────────────────────────────────' -ForegroundColor DarkGray
  if (-not (Test-Path 'node_modules')) {
    Write-Host '📦 Cài dependencies...' -ForegroundColor Yellow
    npm install
  }
  npm run dev
"@

# ── 3. MIDI Microservice (Python :8000) ───────────────────────
Write-Host ""
Write-Host "▶ [3/4] Khởi động MIDI Service (port 8000)..." -ForegroundColor Yellow
Start-Process "powershell" -ArgumentList "-NoExit", "-Command", @"
  Set-Location '$ROOT\midi-service'
  `$host.UI.RawUI.WindowTitle = '🐍 MIDI Service :8000'
  Write-Host '🐍  MIDI Microservice - localhost:8000' -ForegroundColor Cyan
  Write-Host '─────────────────────────────────────' -ForegroundColor DarkGray
  if (-not (Test-Path 'venv')) {
    Write-Host '🐍 Tạo virtual environment...' -ForegroundColor Yellow
    python -m venv venv
  }
  .\venv\Scripts\Activate.ps1
  pip install -r requirements.txt -q
  uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"@

# ── 4. Game Frontend (Next.js :3000) ──────────────────────────
Write-Host ""
Write-Host "▶ [4/4] Khởi động Game Frontend (port 3000)..." -ForegroundColor Yellow
Start-Process "powershell" -ArgumentList "-NoExit", "-Command", @"
  Set-Location '$ROOT\piano-frontend'
  `$host.UI.RawUI.WindowTitle = '🎮 Game :3000'
  Write-Host '🎮  Game Frontend - localhost:3000' -ForegroundColor Cyan
  Write-Host '─────────────────────────────────' -ForegroundColor DarkGray
  if (-not (Test-Path 'node_modules')) {
    Write-Host '📦 Cài dependencies...' -ForegroundColor Yellow
    npm install
  }
  npm run dev
"@

# ── Admin CMS (Next.js :3002) — Tuỳ chọn ────────────────────
$runAdmin = Read-Host "  Bạn có muốn mở Admin CMS (port 3002) không? [y/N]"
if ($runAdmin -eq 'y' -or $runAdmin -eq 'Y') {
    Start-Process "powershell" -ArgumentList "-NoExit", "-Command", @"
  Set-Location '$ROOT\piano-admin'
  `$host.UI.RawUI.WindowTitle = '🎛️ Admin CMS :3002'
  Write-Host '🎛️   Admin CMS - localhost:3002' -ForegroundColor Cyan
  if (-not (Test-Path 'node_modules')) { npm install }
  npm run dev
"@
}

# ── Done ──────────────────────────────────────────────────────
Write-Host ""
Write-Host "================================================" -ForegroundColor DarkGray
Write-Host "🎉  Services đang khởi động trong các cửa sổ mới!" -ForegroundColor Green
Write-Host ""
Write-Host "  🎮 Game       → http://localhost:3000" -ForegroundColor Cyan
Write-Host "  🗄️  Backend    → http://localhost:3001/health" -ForegroundColor Cyan
Write-Host "  🐍 MIDI Docs  → http://localhost:8000/docs" -ForegroundColor Cyan
if ($runAdmin -eq 'y' -or $runAdmin -eq 'Y') {
Write-Host "  🎛️  Admin CMS  → http://localhost:3002" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "  💡 Lần đầu chạy? Mở terminal mới và chạy: .\setup-db.ps1" -ForegroundColor DarkYellow
Write-Host "================================================" -ForegroundColor DarkGray
