# Apply all Push Thru SQL migrations to the linked Supabase project.
# Requires: supabase CLI logged in + project linked.

param(
  [string]$ProjectRef = "jpnaotxkcpnwgqkzxdue"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$migDir = Join-Path $root "supabase\migrations"

if (-not (Test-Path $migDir)) {
  throw "Migrations folder not found: $migDir"
}

$files = Get-ChildItem -Path $migDir -Filter "*.sql" | Sort-Object Name
if (-not $files) {
  throw "No .sql files in $migDir"
}

Write-Host "Applying $($files.Count) migration(s) to project $ProjectRef ..." -ForegroundColor Cyan

foreach ($f in $files) {
  Write-Host ""
  Write-Host ">>> $($f.Name)" -ForegroundColor Yellow
  supabase db query --linked --file $f.FullName
  if ($LASTEXITCODE -ne 0) {
    throw "Migration failed: $($f.Name)"
  }
  Write-Host "OK $($f.Name)" -ForegroundColor Green
}

Write-Host ""
Write-Host "All migrations applied." -ForegroundColor Green
Write-Host "Dashboard checklist: docs\SUPABASE.md" -ForegroundColor Cyan
Write-Host "  - Anonymous + Email providers ON"
Write-Host "  - Site URL + redirect URLs for GitHub Pages"
