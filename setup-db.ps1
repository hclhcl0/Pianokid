# ============================================================
#  KidsPiano - Database Setup & Seed
#  Chạy sau lần đầu start-local.ps1
# ============================================================

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Definition

Write-Host ""
Write-Host "🌱 KidsPiano - Database Setup..." -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor DarkGray

Set-Location "$ROOT\piano-backend"

Write-Host ""
Write-Host "▶ Generate Prisma Client..." -ForegroundColor Yellow
npx prisma generate

Write-Host ""
Write-Host "▶ Chạy Database Migration..." -ForegroundColor Yellow
npx prisma migrate dev --name init

Write-Host ""
Write-Host "▶ Seed dữ liệu mẫu (Admin, Parent, Kids, Lessons)..." -ForegroundColor Yellow
npx ts-node prisma/seed.ts

Write-Host ""
Write-Host "=================================" -ForegroundColor DarkGray
Write-Host "✅ Database sẵn sàng!" -ForegroundColor Green
Write-Host ""
Write-Host "  👤 Admin:  name='Admin', role=ADMIN" -ForegroundColor DarkGray
Write-Host "  👨 Parent: name='Parent Demo', role=PARENT" -ForegroundColor DarkGray
Write-Host "  👧 Kids:   2 tài khoản trẻ em" -ForegroundColor DarkGray
Write-Host "  🎵 Lessons: Twinkle Twinkle, Happy Birthday, Mary Had a Little Lamb" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  🔍 Xem DB trực tiếp: npx prisma studio" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor DarkGray
