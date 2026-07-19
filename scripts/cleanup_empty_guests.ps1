# Delete empty anonymous "Player" accounts (0 scores) — Push Thru hygiene.
# Safe: only anon/guest profiles with zero progress and default name.
# Does NOT touch email users or anyone with lifetime/high/challenge > 0.

$ErrorActionPreference = "Stop"
$ProjectRef = "jpnaotxkcpnwgqkzxdue"
$base = "https://$ProjectRef.supabase.co"

Write-Host "Finding empty guest Players..." -ForegroundColor Cyan
$table = supabase db query --linked --output table @"
select u.id
from auth.users u
join public.jp_profiles p on p.id = u.id
where p.display_name = 'Player'
  and coalesce(p.lifetime_count,0) = 0
  and coalesce(p.high_score,0) = 0
  and coalesce(p.challenge_best,0) = 0
  and (u.is_anonymous is true or u.email is null);
"@ 2>&1 | Out-String

$ids = [regex]::Matches($table, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}') |
  ForEach-Object { $_.Value } | Select-Object -Unique

if (-not $ids.Count) {
  Write-Host "Nothing to clean." -ForegroundColor Green
  exit 0
}

Write-Host "Will delete $($ids.Count) empty guests." -ForegroundColor Yellow
$raw = supabase projects api-keys --project-ref $ProjectRef 2>&1 | Out-String
if ($raw -notmatch 'service_role\s+\|\s+(eyJ[A-Za-z0-9_\-\.]+)') {
  throw "Could not load service_role key"
}
$service = $Matches[1].Trim()
$headers = @{ apikey = $service; Authorization = "Bearer $service" }

$ok = 0
foreach ($id in $ids) {
  try {
    Invoke-RestMethod -Uri "$base/auth/v1/admin/users/$id" -Method Delete -Headers $headers | Out-Null
    $ok++
    Write-Host "  deleted $id"
  } catch {
    Write-Host "  FAIL $id" -ForegroundColor Red
  }
}
Write-Host "Done. Deleted $ok / $($ids.Count)." -ForegroundColor Green
