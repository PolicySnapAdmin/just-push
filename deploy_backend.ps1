# Apply Just Push SQL to the linked Supabase project (PumpQuest shared).
# Requires: supabase CLI logged in + linked, or pass -ProjectRef.

param(
  [string]$ProjectRef = "jpnaotxkcpnwgqkzxdue"
)

$ErrorActionPreference = "Stop"
$sqlPath = Join-Path $PSScriptRoot "supabase\migrations\20260718000000_just_push.sql"

if (-not (Test-Path $sqlPath)) {
  throw "Migration not found: $sqlPath"
}

Write-Host "Applying Just Push migration to project $ProjectRef ..." -ForegroundColor Cyan
Write-Host "File: $sqlPath"

# Prefer db query --linked if this folder is linked; else project-ref
$sql = Get-Content -Raw -Path $sqlPath

try {
  supabase db query --linked $sql
} catch {
  Write-Host "Linked query failed, trying project-ref..." -ForegroundColor Yellow
  # Fallback: open SQL editor instructions
  Write-Host ""
  Write-Host "If the CLI cannot run SQL, paste the migration into the Supabase SQL Editor:" -ForegroundColor Yellow
  Write-Host "  https://supabase.com/dashboard/project/$ProjectRef/sql/new"
  Write-Host "  File: $sqlPath"
  throw
}

Write-Host ""
Write-Host "Next (dashboard):" -ForegroundColor Green
Write-Host "  1. Authentication → Providers → enable Anonymous"
Write-Host "  2. Authentication → Providers → enable GitHub (optional)"
Write-Host "  3. Authentication → URL Configuration → add your GitHub Pages URL"
Write-Host "     e.g. https://YOURUSER.github.io/just-push/"
Write-Host "Done."
