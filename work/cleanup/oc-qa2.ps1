# OC-CLEANUP follow-up C: start static server, run the mandated QA set, stop server.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
$log = Join-Path $root 'work/cleanup'
$port = if ($env:PORT) { $env:PORT } else { '8879' }
$env:PORT = $port

function RunNode([string]$label, [string[]]$nodeArgs, [int]$timeoutSec) {
  $out = Join-Path $log "oc-qa2-$label.out"
  $err = Join-Path $log "oc-qa2-$label.err"
  Remove-Item $out,$err -ErrorAction SilentlyContinue
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $p = Start-Process -FilePath "node" -ArgumentList $nodeArgs -NoNewWindow -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
  $ok = $p.WaitForExit($timeoutSec * 1000)
  $code = if ($ok) { $p.ExitCode } else { try { Stop-Process -Id $p.Id -Force } catch {}; 124 }
  $sw.Stop()
  $s = "oc-qa2-$label exit=$code elapsed=$([math]::Round($sw.Elapsed.TotalSeconds,1))s"
  $s | Out-File -FilePath (Join-Path $log "oc-qa2-$label.status.txt") -Encoding utf8
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
"server pid=$($srv.Id)" | Out-File -FilePath (Join-Path $log 'oc-qa2-server-pid.txt') -Encoding utf8

$failures = @()

$code = RunNode 'node-test' @('--test','outputs/hcmc-poc/test/*.test.mjs') 900
if ($code -ne 0) { $failures += "node-test($code)" }

$code = RunNode 'shared-core' @('--test','outputs/shared/digital-twin-core/tests/source-core.cjs','outputs/shared/digital-twin-core/tests/gis-projects.cjs','outputs/shared/digital-twin-core/tests/gis-kernel.cjs','outputs/shared/digital-twin-core/tests/gis-client.cjs','outputs/shared/digital-twin-core/tests/gis-worker.cjs','outputs/shared/digital-twin-core/tests/streaming-18.cjs') 900

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

$venvPy = Join-Path $root 'outputs/smart-traffic/backend/.venv/Scripts/python.exe'
$pout = Join-Path $log 'oc-qa2-pytest.out'
& $venvPy -m pytest outputs/smart-traffic/backend/tests -q -p no:cacheprovider *> $pout
$pcode = $LASTEXITCODE
"oc-qa2-pytest exit=$pcode" | Write-Output
if ($pcode -ne 0) { $failures += "pytest($pcode)" }

$code = RunNode '404' @('work/cleanup/hk-404.cjs') 600
if ($code -ne 0) { $failures += "404($code)" }

Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue
"server stopped (pid $($srv.Id))"
if ($failures.Count) { "FAILURES: $($failures -join ', ')" } else { "ALL GREEN" }
