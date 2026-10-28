param([ValidateSet('start', 'stop', 'status')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = if ($env:SHOPFAST_RUNTIME_DIR) { $env:SHOPFAST_RUNTIME_DIR } else { Join-Path $projectRoot 'tools/.runtime/services' }
$pgBin = Join-Path $runtimeRoot 'postgresql/pgsql/bin'
$pgData = Join-Path $runtimeRoot 'pgdata'
$pgLog = Join-Path $runtimeRoot 'postgres.log'
$dbUrl = $env:DATABASE_URL
$envFile = Join-Path $projectRoot '.env'
if (!$dbUrl -and (Test-Path -LiteralPath $envFile)) {
  $match = [regex]::Match((Get-Content -LiteralPath $envFile -Raw), '(?m)^DATABASE_URL=(.+)$')
  if ($match.Success) { $dbUrl = $match.Groups[1].Value.Trim().Trim('"').Trim("'") }
}
if (!$dbUrl -and (Test-Path (Join-Path $runtimeRoot 'application-url'))) { $dbUrl = (Get-Content (Join-Path $runtimeRoot 'application-url') -Raw).Trim() }
$port = 5432
if ($dbUrl) {
  $dbUri = [uri]$dbUrl
  if ($dbUri.Host -notin @('localhost', '127.0.0.1', '[::1]', '::1')) { throw 'Native PostgreSQL helper requires a loopback DATABASE_URL.' }
  if ($dbUri.Port -gt 0) { $port = $dbUri.Port }
}
if (!(Test-Path (Join-Path $pgBin 'pg_ctl.exe')) -or !(Test-Path (Join-Path $pgData 'PG_VERSION'))) {
  throw 'Project-local PostgreSQL runtime is missing; install PostgreSQL 16 native and configure .env.'
}
switch ($Action) {
  'start' {
    $null = & "$pgBin/pg_ctl.exe" -D $pgData status 2>&1
    if ($LASTEXITCODE -eq 0) {
      & "$pgBin/pg_isready.exe" -h 127.0.0.1 -p $port
      if ($LASTEXITCODE -ne 0) { throw 'Project PostgreSQL is running on a different port; check DATABASE_URL.' }
      Write-Output "Project PostgreSQL already ready on port $port"
      exit 0
    }
    & "$pgBin/pg_ctl.exe" -D $pgData -l $pgLog -o "-h 127.0.0.1 -p $port -c shared_buffers=32MB -c max_connections=20" start
  }
  'stop' { & "$pgBin/pg_ctl.exe" -D $pgData -m fast stop }
  'status' { & "$pgBin/pg_ctl.exe" -D $pgData status }
}
exit $LASTEXITCODE
