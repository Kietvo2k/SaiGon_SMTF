# Self-contained QA runner: starts static server, runs cleanup QA checks, stops server.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
$log = Join-Path $root 'work/cleanup'
$port = if ($env:PORT) { $env:PORT } else { '8879' }
$env:PORT = $port
if (-not $env:NODE_OPTIONS) { $env:NODE_OPTIONS = '--max-old-space-size=8192' }

function RunNode([string]$label, [string[]]$nodeArgs, [int]$timeoutSec) {
  $out = Join-Path $log "qa-$label.out"
  $err = Join-Path $log "qa-$label.err"
  Remove-Item $out,$err -ErrorAction SilentlyContinue
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $p = Start-Process -FilePath "node" -ArgumentList $nodeArgs -NoNewWindow -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
  $ok = $p.WaitForExit($timeoutSec * 1000)
  $code = 124
  if ($ok) { $p.Refresh(); $code = $p.ExitCode } else { try { Stop-Process -Id $p.Id -Force } catch {} }
  $sw.Stop()
  $s = "qa-$label exit=$code elapsed=$([math]::Round($sw.Elapsed.TotalSeconds,1))s"
  $s | Out-File -FilePath (Join-Path $log "qa-$label.status.txt") -Encoding utf8
  Write-Output $s
  return $code
}

$py = (Get-Command python).Source
$srv = Start-Process -FilePath $py -ArgumentList 'outputs/hcmc-poc/serve.py' -WorkingDirectory $root -PassThru -WindowStyle Hidden
$up = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 250
  try { $r = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/hcmc-poc/" -TimeoutSec 2; if ($r.StatusCode -eq 200) { $up = $true; break } } catch {}
}
"server up: $up (pid $($srv.Id))"
if (-not $up) { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue; exit 1 }

$failures = @()

# 1. node --test
$code = RunNode 'node-test' @('--test','outputs/hcmc-poc/test/*.test.mjs') 900
if ($code -ne 0) { $failures += "node-test($code)" }

# 2. QA scripts
Get-ChildItem -Path (Join-Path $root 'outputs/smart-traffic/backend/app'),(Join-Path $root 'outputs/smart-traffic/backend/tests') -Recurse -Directory -Filter '__pycache__' -ErrorAction SilentlyContinue | ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
$qas = @(
  @{n='north-32';     a=@('outputs/hcmc-poc/scripts/qa-north-32.cjs')},
  @{n='capture-32';   a=@('outputs/hcmc-poc/scripts/qa-capture-32.cjs')},
  @{n='traffic-31';   a=@('outputs/hcmc-poc/scripts/qa-traffic-31.cjs','webgl')},
  @{n='region-31';    a=@('outputs/hcmc-poc/scripts/qa-region-31.cjs','webgl')},
  @{n='hygiene';      a=@('outputs/hcmc-poc/scripts/qa-project-hygiene.cjs')},
  @{n='signature-31'; a=@('outputs/hcmc-poc/scripts/validate_signature_registry_31.cjs')}
)
foreach ($q in $qas) {
  $code = RunNode $q.n $q.a 900
  if ($code -ne 0) { $failures += "$($q.n)($code)" }
}

# 3. pytest backend
$venvPy = Join-Path $root 'outputs/smart-traffic/backend/.venv/Scripts/python.exe'
$pout = Join-Path $log 'qa-pytest.out'
& $venvPy -m pytest outputs/smart-traffic/backend/tests -q -p no:cacheprovider *> $pout
$pcode = $LASTEXITCODE
"qa-pytest exit=$pcode" | Write-Output
if ($pcode -ne 0) { $failures += "pytest($pcode)" }

# 4. Playwright smoke
$code = RunNode 'smoke' @('work/cleanup/smoke.cjs') 300
if ($code -ne 0) { $failures += "smoke($code)" }

Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue
"server stopped"
if ($failures.Count) { "FAILURES: $($failures -join ', ')" } else { "ALL GREEN" }
