param([string]$Script='qa-region-31',[string]$Tag='region',[string[]]$Args=@('webgl'),[int]$TimeoutSec=900)
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
$port='8879'; $env:PORT=$port
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
$srv = Start-Process -FilePath (Get-Command python).Source -ArgumentList 'outputs/hcmc-poc/serve.py' -WorkingDirectory $root -PassThru -WindowStyle Hidden
$up=$false
for ($i=0;$i -lt 40;$i++){ Start-Sleep -Milliseconds 250; try { if((Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$port/hcmc-poc/" -TimeoutSec 2).StatusCode -eq 200){$up=$true;break} } catch {} }
"server up=$up pid=$($srv.Id)"
$out = Join-Path $root "work/cleanup/qa-$Tag.out"
$err = Join-Path $root "work/cleanup/qa-$Tag.err"
$p = Start-Process -FilePath "node" -ArgumentList (@("outputs/hcmc-poc/scripts/$Script.cjs") + $Args) -NoNewWindow -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
$ok = $p.WaitForExit($TimeoutSec * 1000)
$code = if ($ok) { $p.ExitCode } else { try { $p.Kill() } catch {}; 124 }
"exit=$code ok=$ok"
if ($srv) { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue }
