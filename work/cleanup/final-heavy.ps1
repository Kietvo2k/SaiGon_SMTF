$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\Admin\orca\workspaces\SaiGon_SMTF\smart-bac'
$env:PORT = '8879'
$out = 'work/cleanup/final-heavy.out'
"=== qa-traffic-31 webgl ===" | Out-File -FilePath $out -Encoding utf8
node outputs/hcmc-poc/scripts/qa-traffic-31.cjs webgl *>&1 | Out-File -FilePath $out -Append -Encoding utf8
"traffic-exit=$LASTEXITCODE" | Out-File -FilePath $out -Append -Encoding utf8
"=== qa-region-31 webgl ===" | Out-File -FilePath $out -Append -Encoding utf8
node outputs/hcmc-poc/scripts/qa-region-31.cjs webgl *>&1 | Out-File -FilePath $out -Append -Encoding utf8
"region-exit=$LASTEXITCODE" | Out-File -FilePath $out -Append -Encoding utf8
"=== smoke ===" | Out-File -FilePath $out -Append -Encoding utf8
node work/cleanup/smoke.cjs *>&1 | Out-File -FilePath $out -Append -Encoding utf8
"smoke-exit=$LASTEXITCODE" | Out-File -FilePath $out -Append -Encoding utf8
"done" | Out-File -FilePath $out -Append -Encoding utf8
