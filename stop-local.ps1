# ============================================================
#  KidsPiano - Stop All Local Services
# ============================================================

Write-Host "🛑 Dừng tất cả KidsPiano services..." -ForegroundColor Red

# Dừng Node.js processes
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "  ✅ Node.js processes đã dừng" -ForegroundColor Green

# Dừng Python/uvicorn
Get-Process -Name "python" -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Host "  ✅ Python processes đã dừng" -ForegroundColor Green

# Dừng PostgreSQL Docker container
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Definition
docker compose -f "$ROOT\docker-compose.local.yml" down
Write-Host "  ✅ PostgreSQL container đã dừng" -ForegroundColor Green

Write-Host ""
Write-Host "👋 Đã dừng toàn bộ. Tạm biệt!" -ForegroundColor Cyan
