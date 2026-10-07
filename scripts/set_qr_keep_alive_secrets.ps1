# Wire GitHub Actions secrets for the daily QR keep-alive.
# Pulls the QR service_role from the Supabase CLI (never prints the full key)
# and sets QR_SUPABASE_URL + QR_SUPABASE_SERVICE_ROLE_KEY on this repo.
# Does not touch the Push Thru SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY secrets.
#
# Prerequisites:
#   - gh auth login
#   - supabase login
#   - git remote origin pointing at PolicySnapAdmin/just-push
#
# Usage (from repo root):
#   .\scripts\set_qr_keep_alive_secrets.ps1
#   .\scripts\set_qr_keep_alive_secrets.ps1 -TriggerRun

param(
  [string]$ProjectRef = "iqeshszhcumphrnjvsoq",
  [switch]$TriggerRun,
  [switch]$SkipList
)

$ErrorActionPreference = "Stop"

function Require-Cmd([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing command: $Name"
  }
}

Require-Cmd gh
Require-Cmd supabase

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot
try {
  $remote = (git remote get-url origin 2>$null)
  if (-not $remote) { throw "No git remote 'origin'. Run from the just-push repo." }

  Write-Host "Repo remote: $remote" -ForegroundColor Cyan
  Write-Host "Project ref: $ProjectRef" -ForegroundColor Cyan

  $url = "https://$ProjectRef.supabase.co"
  Write-Host "Fetching API keys via Supabase CLI..." -ForegroundColor Cyan

  $raw = supabase projects api-keys --project-ref $ProjectRef 2>&1 | Out-String
  if ($raw -notmatch 'service_role\s+\|\s+(eyJ[A-Za-z0-9_\-\.]+)') {
    throw "Could not parse service_role from 'supabase projects api-keys'. Are you logged in?"
  }
  $service = $Matches[1].Trim()
  if ($service.Length -lt 40) { throw "service_role key looks too short." }

  $keyPreview = $service.Substring(0, 12) + "..." + $service.Substring($service.Length - 6)
  Write-Host "service_role loaded ($keyPreview)" -ForegroundColor DarkGray

  Write-Host "Setting GitHub secret QR_SUPABASE_URL..." -ForegroundColor Cyan
  $url | gh secret set QR_SUPABASE_URL
  if ($LASTEXITCODE -ne 0) { throw "gh secret set QR_SUPABASE_URL failed (exit $LASTEXITCODE)" }

  Write-Host "Setting GitHub secret QR_SUPABASE_SERVICE_ROLE_KEY..." -ForegroundColor Cyan
  $service | gh secret set QR_SUPABASE_SERVICE_ROLE_KEY
  if ($LASTEXITCODE -ne 0) { throw "gh secret set QR_SUPABASE_SERVICE_ROLE_KEY failed (exit $LASTEXITCODE)" }

  $service = $null
  [GC]::Collect()

  if (-not $SkipList) {
    Write-Host ""
    Write-Host "Repo Action secrets (names only):" -ForegroundColor Green
    gh secret list
  }

  Write-Host ""
  Write-Host "Done. QR keep-alive will run at 09:15 UTC." -ForegroundColor Green
  Write-Host "Manual run:  gh workflow run qr-keep-alive.yml" -ForegroundColor DarkGray
  Write-Host "Logs:        gh run list --workflow=qr-keep-alive.yml" -ForegroundColor DarkGray

  if ($TriggerRun) {
    Write-Host ""
    Write-Host "Dispatching qr-keep-alive.yml..." -ForegroundColor Cyan
    gh workflow run qr-keep-alive.yml
    if ($LASTEXITCODE -ne 0) { throw "workflow_dispatch failed" }
    Start-Sleep -Seconds 3
    gh run list --workflow=qr-keep-alive.yml --limit 3
  }
}
finally {
  Pop-Location
}
