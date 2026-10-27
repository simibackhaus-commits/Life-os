# Schreibt die öffentlichen Supabase-Werte (URL + anon key) nach .env.local.
# Der geheime service_role-Key wird bewusst weder ausgegeben noch gespeichert.
param([Parameter(Mandatory = $true)][string]$ProjectRef)

$root = Split-Path -Parent $PSScriptRoot
$json = pnpm --silent --dir $root exec supabase projects api-keys --project-ref $ProjectRef -o json | Out-String
$keys = $json | ConvertFrom-Json
$anon = ($keys | Where-Object { $_.name -eq 'anon' } | Select-Object -First 1).api_key
if (-not $anon) { throw 'anon key nicht gefunden' }

$lines = @(
  "VITE_SUPABASE_URL=https://$ProjectRef.supabase.co",
  "VITE_SUPABASE_ANON_KEY=$anon"
)
Set-Content -Path (Join-Path $root '.env.local') -Value $lines -Encoding utf8
Write-Host ".env.local geschrieben (URL + anon key)."
