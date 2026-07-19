# Push Thru — offline backup (schema already in git migrations; this dumps LIVE DATA).
#
# Writes a timestamped folder under backups/ (gitignored). Contains:
#   - jp_*.json          all Push Thru public tables (service_role)
#   - auth_users.json    Auth users (emails, ids, metadata — NO password hashes via this API)
#   - MANIFEST.json      counts, project ref, git sha, created_at
#   - migrations/        copy of supabase/migrations (schema source of truth)
#   - config.public.json public client config snapshot (anon key is public by design)
#
# Prerequisites:
#   - supabase login  (or access token) with project access
#   - Network to *.supabase.co
#
# Usage (from repo root):
#   .\scripts\backup_pushthru.ps1
#   .\scripts\backup_pushthru.ps1 -Zip
#   .\scripts\backup_pushthru.ps1 -IncludePolicySnap   # also dump policysnap_* tables
#   .\scripts\backup_pushthru.ps1 -OutRoot D:\Offsite\pushthru-backups
#
# SECURITY: backups contain player data. Keep off the public repo. Prefer encrypted
# cloud/USB copy. After a breach, treat old dumps as compromised and rotate keys.

param(
  [string]$ProjectRef = "jpnaotxkcpnwgqkzxdue",
  [string]$OutRoot = "",
  [switch]$Zip,
  [switch]$IncludePolicySnap,
  [switch]$SkipAuthUsers
)

$ErrorActionPreference = "Stop"

function Require-Cmd([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing command: $Name"
  }
}

function Get-ServiceRoleKey([string]$Ref) {
  $raw = supabase projects api-keys --project-ref $Ref 2>&1 | Out-String
  if ($raw -notmatch 'service_role\s+\|\s+(eyJ[A-Za-z0-9_\-\.]+)') {
    throw "Could not parse service_role from supabase CLI. Run: supabase login"
  }
  return $Matches[1].Trim()
}

function Export-RestTable {
  param(
    [string]$BaseUrl,
    [hashtable]$Headers,
    [string]$Table,
    [string]$OutFile,
    [int]$PageSize = 1000
  )
  $all = [System.Collections.Generic.List[object]]::new()
  $offset = 0
  $h = @{
    apikey        = $Headers.apikey
    Authorization = $Headers.Authorization
  }
  while ($true) {
    $uri = "{0}/rest/v1/{1}?select=*&limit={2}&offset={3}" -f $BaseUrl, $Table, $PageSize, $offset
    try {
      $resp = Invoke-WebRequest -Uri $uri -Headers $h -UseBasicParsing -ErrorAction Stop
    } catch {
      $code = $null
      if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
      if ($code -eq 404 -or $code -eq 406) {
        Write-Host "  skip $Table (not exposed / missing)" -ForegroundColor DarkYellow
        return @{ table = $Table; rows = 0; skipped = $true }
      }
      throw "Export $Table failed: $($_.Exception.Message) $($_.ErrorDetails.Message)"
    }
    $chunk = @()
    if ($resp.Content -and $resp.Content.Trim() -ne "" -and $resp.Content.Trim() -ne "[]") {
      $parsed = $resp.Content | ConvertFrom-Json
      if ($parsed -is [System.Array]) { $chunk = @($parsed) }
      elseif ($null -ne $parsed) { $chunk = @($parsed) }
    }
    foreach ($row in $chunk) { $all.Add($row) }
    if ($chunk.Count -lt $PageSize) { break }
    $offset += $PageSize
    if ($offset -gt 500000) { throw "Safety stop: $Table offset $offset" }
  }
  if ($all.Count -eq 0) {
    $json = "[]"
  } else {
    $json = ($all.ToArray() | ConvertTo-Json -Depth 30)
    if ($all.Count -eq 1 -and -not $json.TrimStart().StartsWith("[")) {
      $json = "[$json]"
    }
  }
  [System.IO.File]::WriteAllText($OutFile, $json, [System.Text.UTF8Encoding]::new($false))
  return @{ table = $Table; rows = $all.Count; skipped = $false; file = (Split-Path $OutFile -Leaf) }
}

function Export-AuthUsers {
  param(
    [string]$BaseUrl,
    [hashtable]$Headers,
    [string]$OutFile,
    [int]$PerPage = 200
  )
  $all = [System.Collections.Generic.List[object]]::new()
  $page = 1
  while ($true) {
    $uri = "$BaseUrl/auth/v1/admin/users?page=$page&per_page=$PerPage"
    try {
      $resp = Invoke-RestMethod -Uri $uri -Headers $Headers -ErrorAction Stop
    } catch {
      throw "Auth users export failed: $($_.Exception.Message) $($_.ErrorDetails.Message)"
    }
    $users = @()
    if ($resp.users) { $users = @($resp.users) }
    elseif ($resp -is [System.Array]) { $users = $resp }
    foreach ($u in $users) {
      # Strip noisy / sensitive fields we cannot restore usefully
      $all.Add([pscustomobject]@{
        id                 = $u.id
        email              = $u.email
        phone              = $u.phone
        created_at         = $u.created_at
        updated_at         = $u.updated_at
        last_sign_in_at    = $u.last_sign_in_at
        email_confirmed_at = $u.email_confirmed_at
        is_anonymous       = $u.is_anonymous
        app_metadata       = $u.app_metadata
        user_metadata      = $u.user_metadata
        identities         = $u.identities
        banned_until       = $u.banned_until
        deleted_at         = $u.deleted_at
      })
    }
    if ($users.Count -lt $PerPage) { break }
    $page++
    if ($page -gt 500) { throw "Auth pagination safety stop at page 500" }
  }
  $json = if ($all.Count -eq 0) { "[]" } else { ($all | ConvertTo-Json -Depth 20) }
  if ($all.Count -eq 1 -and -not $json.TrimStart().StartsWith("[")) { $json = "[$json]" }
  [System.IO.File]::WriteAllText($OutFile, $json, [System.Text.UTF8Encoding]::new($false))
  return $all.Count
}

Require-Cmd supabase

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $OutRoot) {
  $OutRoot = Join-Path $repoRoot "backups"
}
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dest = Join-Path $OutRoot $stamp
New-Item -ItemType Directory -Path $dest -Force | Out-Null
$dataDir = Join-Path $dest "data"
$migDest = Join-Path $dest "migrations"
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

Write-Host ("Push Thru backup -> {0}" -f $dest) -ForegroundColor Cyan
Write-Host ("Project: {0}" -f $ProjectRef) -ForegroundColor DarkGray

$service = Get-ServiceRoleKey $ProjectRef
$base = "https://$ProjectRef.supabase.co"
$headers = @{
  apikey        = $service
  Authorization = "Bearer $service"
}

# --- migrations (schema) ---
$migSrc = Join-Path $repoRoot "supabase\migrations"
if (Test-Path $migSrc) {
  Copy-Item -Path $migSrc -Destination $migDest -Recurse -Force
  $migCount = (Get-ChildItem $migDest -Filter "*.sql").Count
  Write-Host "Copied $migCount migration file(s)" -ForegroundColor Green
} else {
  Write-Host "WARNING: no migrations folder" -ForegroundColor Yellow
  $migCount = 0
}

# --- public config snapshot ---
$configPath = Join-Path $repoRoot "config.js"
if (Test-Path $configPath) {
  Copy-Item $configPath (Join-Path $dest "config.js")
}

# --- table list (fixed + optional PolicySnap). Missing tables are skipped by export. ---
$tables = @(
  "jp_admins",
  "jp_board_posts",
  "jp_friend_messages",
  "jp_friend_requests",
  "jp_friendships",
  "jp_group_members",
  "jp_groups",
  "jp_name_history",
  "jp_profiles",
  "jp_pvp_h2h",
  "jp_pvp_matches",
  "jp_pvp_stats",
  "jp_territory_scores",
  "jp_wallet_ledger",
  "jp_wallets"
)
if ($IncludePolicySnap) {
  $tables += @("policysnap_usage_client", "policysnap_usage_ip")
}
Write-Host ("Exporting {0} table(s)..." -f $tables.Count) -ForegroundColor Cyan

$exportMeta = @()
foreach ($t in $tables) {
  Write-Host "  export $t ..." -NoNewline
  $out = Join-Path $dataDir "$t.json"
  $meta = Export-RestTable -BaseUrl $base -Headers $headers -Table $t -OutFile $out
  $exportMeta += $meta
  if ($meta.skipped) { Write-Host "" }
  else { Write-Host " $($meta.rows) rows" -ForegroundColor Green }
}

# --- auth users ---
$authCount = 0
if (-not $SkipAuthUsers) {
  Write-Host "  export auth users ..." -NoNewline
  try {
    $authCount = Export-AuthUsers -BaseUrl $base -Headers $headers -OutFile (Join-Path $dataDir "auth_users.json")
    Write-Host " $authCount users" -ForegroundColor Green
  } catch {
    Write-Host " FAILED: $_" -ForegroundColor Red
    Write-Host "  (profiles still backed up; Auth re-create may need password resets)" -ForegroundColor DarkYellow
  }
}

# --- git sha ---
$gitSha = ""
Push-Location $repoRoot
try { $gitSha = (git rev-parse HEAD 2>$null) } catch { }
Pop-Location

$manifest = [ordered]@{
  created_at_utc     = (Get-Date).ToUniversalTime().ToString("o")
  project_ref        = $ProjectRef
  supabase_url       = $base
  git_sha            = $gitSha
  migration_files    = $migCount
  auth_users         = $authCount
  tables             = $exportMeta
  notes              = @(
    "Schema source of truth: migrations/ (also in git).",
    "Auth export has no password hashes - users must reset password after full Auth rebuild.",
    "Do not commit this folder. Copy off-machine (encrypted USB / private cloud).",
    "Restore: see docs/BACKUP.md"
  )
}
$manifestPath = Join-Path $dest "MANIFEST.json"
($manifest | ConvertTo-Json -Depth 8) | Set-Content -Path $manifestPath -Encoding utf8

# clear key from memory as much as PS allows
$service = $null
$headers = $null

$totalRows = 0
foreach ($m in $exportMeta) {
  if ($m -is [hashtable]) {
    if (-not $m["skipped"]) { $totalRows += [int]$m["rows"] }
  } elseif (-not $m.skipped) {
    $totalRows += [int]$m.rows
  }
}
Write-Host ""
Write-Host "Backup complete: $dest" -ForegroundColor Green
Write-Host ("  tables={0}  data_rows~={1}  auth_users={2}  migrations={3}" -f $exportMeta.Count, $totalRows, $authCount, $migCount)

$zipPath = $null
if ($Zip) {
  $zipPath = "$dest.zip"
  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  Compress-Archive -Path $dest -DestinationPath $zipPath -Force
  $kb = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)
  Write-Host ("  zip: {0} ({1} KB)" -f $zipPath, $kb) -ForegroundColor Green
}

Write-Host ""
Write-Host "Next: copy folder/zip to offsite storage. Then: docs\BACKUP.md" -ForegroundColor Cyan
return $dest
