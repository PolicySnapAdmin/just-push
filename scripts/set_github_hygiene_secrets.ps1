# Wire GitHub Actions secrets for daily Push Thru hygiene.
# Pulls service_role from Supabase CLI (never prints the full key) and
# sets SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY on the current git remote repo.
#
# Prerequisites:
#   - gh auth login  (repo scope)
#   - supabase login (or access token) with project access
#   - git remote origin pointing at PolicySnapAdmin/just-push
#
# Usage (from repo root):
#   .\scripts\set_github_hygiene_secrets.ps1
#   .\scripts\set_github_hygiene_secrets.ps1 -TriggerRun   # also fire workflow_dispatch

param(
  [string]$ProjectRef = "jpnaotxkcpnwgqkzxdue",
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

  Write-Host "Setting GitHub secret SUPABASE_URL..." -ForegroundColor Cyan
  $url | gh secret set SUPABASE_URL
  if ($LASTEXITCODE -ne 0) { throw "gh secret set SUPABASE_URL failed (exit $LASTEXITCODE)" }

  Write-Host "Setting GitHub secret SUPABASE_SERVICE_ROLE_KEY..." -ForegroundColor Cyan
  $service | gh secret set SUPABASE_SERVICE_ROLE_KEY
  if ($LASTEXITCODE -ne 0) { throw "gh secret set SUPABASE_SERVICE_ROLE_KEY failed (exit $LASTEXITCODE)" }

  # Clear local copy as soon as possible
  $service = $null
  [GC]::Collect()

  if (-not $SkipList) {
    Write-Host ""
    Write-Host "Repo Action secrets (names only):" -ForegroundColor Green
    gh secret list
  }

  Write-Host ""
  Write-Host "Done. Daily hygiene workflow will run at 08:15 UTC." -ForegroundColor Green
  Write-Host "Manual run:  gh workflow run hygiene-cleanup.yml" -ForegroundColor DarkGray
  Write-Host "Logs:        gh run list --workflow=hygiene-cleanup.yml" -ForegroundColor DarkGray

  if ($TriggerRun) {
    Write-Host ""
    Write-Host "Dispatching hygiene-cleanup.yml..." -ForegroundColor Cyan
    gh workflow run hygiene-cleanup.yml
    if ($LASTEXITCODE -ne 0) { throw "workflow_dispatch failed" }
    Start-Sleep -Seconds 3
    gh run list --workflow=hygiene-cleanup.yml --limit 3
  }
}
finally {
  Pop-Location
}
