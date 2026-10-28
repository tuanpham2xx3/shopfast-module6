param([ValidateSet('start', 'status')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = if ($env:SHOPFAST_RUNTIME_DIR) { $env:SHOPFAST_RUNTIME_DIR } else { Join-Path $projectRoot 'tools/.runtime/services' }
$memuraiDir = Join-Path $runtimeRoot 'memurai-portable/Memurai'
$server = Join-Path $memuraiDir 'memurai.exe'
$cli = Join-Path $memuraiDir 'memurai-cli.exe'
if (!(Test-Path -LiteralPath $server) -or !(Test-Path -LiteralPath $cli)) { throw 'Memurai native runtime not found; install native Memurai or configure SHOPFAST_RUNTIME_DIR.' }
$port = 16380
$redisUrl = $env:REDIS_URL
$envFile = Join-Path $projectRoot '.env'
if (!$redisUrl -and (Test-Path -LiteralPath $envFile)) {
  $match = [regex]::Match((Get-Content -LiteralPath $envFile -Raw), '(?m)^REDIS_URL=(.+)$')
  if ($match.Success) { $redisUrl = $match.Groups[1].Value.Trim().Trim('"').Trim("'") }
}
if ($redisUrl) {
  $redisUri = [uri]$redisUrl
  if ($redisUri.Host -notin @('localhost', '127.0.0.1', '[::1]', '::1')) { throw 'Native Memurai helper requires a loopback REDIS_URL.' }
  $port = if ($redisUri.Port -gt 0) { $redisUri.Port } else { 6379 }
}
function Test-Memurai {
  try {
  $reply = & $cli -h 127.0.0.1 -p $port PING 2>$null
  if ($LASTEXITCODE -ne 0 -or $reply -ne 'PONG') { return $false }
  $info = (& $cli -h 127.0.0.1 -p $port INFO server 2>$null) -join "`n"
  return ($info -match '(?m)^redis_version:7\.' -and $info -match '(?i)memurai')
  } catch { return $false }
}
if (Test-Memurai) { Write-Output "Memurai API7 ready on loopback port $port"; exit 0 }
if ($Action -eq 'status') { Write-Output "Memurai not ready on port $port"; exit 1 }
$dataDir = Join-Path $runtimeRoot "memurai-data-$port"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
$config = Join-Path $dataDir 'memurai.conf'
$redisDataDir = $dataDir.Replace('\', '/')
@"
bind 127.0.0.1
port $port
maxmemory 128mb
maxmemory-policy noeviction
appendonly yes
dir "$redisDataDir"
logfile "$redisDataDir/memurai.log"
"@ | Set-Content -LiteralPath $config -Encoding Ascii
Start-Process -FilePath $server -ArgumentList @('"' + $config + '"') -WindowStyle Hidden
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  Start-Sleep -Milliseconds 250
  if (Test-Memurai) { Write-Output "Memurai API7 ready on loopback port $port"; exit 0 }
}
throw 'Memurai did not become ready; inspect its local runtime log.'
