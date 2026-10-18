param([ValidateSet('start', 'stop', 'status')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pgBin = Join-Path $projectRoot 'tools/.runtime/services/postgresql/pgsql/bin'
$pgData = Join-Path $projectRoot 'tools/.runtime/services/pgdata'
$pgLog = Join-Path $projectRoot 'tools/.runtime/services/postgres.log'
if (!(Test-Path (Join-Path $pgBin 'pg_ctl.exe')) -or !(Test-Path (Join-Path $pgData 'PG_VERSION'))) {
  throw 'Project-local PostgreSQL runtime is missing; install PostgreSQL 16 native and configure .env.'
}
switch ($Action) {
  'start' { & "$pgBin/pg_ctl.exe" -D $pgData -l $pgLog -o '-h 127.0.0.1 -p 55432 -c shared_buffers=32MB -c max_connections=20' start }
  'stop' { & "$pgBin/pg_ctl.exe" -D $pgData -m fast stop }
  'status' { & "$pgBin/pg_ctl.exe" -D $pgData status }
}
exit $LASTEXITCODE
