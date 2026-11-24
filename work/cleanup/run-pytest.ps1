$ErrorActionPreference = 'Continue'
Set-Location 'C:\Users\Admin\orca\workspaces\SaiGon_SMTF\smart-bac\outputs\smart-traffic\backend'
$py = '.venv\Scripts\python.exe'
$out = '..\..\..\work\cleanup\b-pytest.out'
$sw = [System.Diagnostics.Stopwatch]::StartNew()
& $py -u -m pytest tests -p no:cacheprovider --durations=10 *> $out
$code = $LASTEXITCODE
$sw.Stop()
"pytest exit=$code elapsed=$([int]$sw.Elapsed.TotalSeconds)s" | Out-File -FilePath '..\..\..\work\cleanup\b-pytest.status.txt' -Encoding utf8
