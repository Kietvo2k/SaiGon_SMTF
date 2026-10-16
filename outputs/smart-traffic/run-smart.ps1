# T14a: bật cả hệ smart-traffic bằng một lệnh (Windows PowerShell 5.1).
#   (a) server tĩnh outputs/hcmc-poc/serve.py (cổng 8821) cho trang 3D
#   (b) backend FastAPI (cổng 8900): tạo .venv + pip install nếu thiếu, init DB, seed, chạy uvicorn
#   (c) web build (cổng 5173): npm ci nếu thiếu node_modules, npm run build, vite preview
# Dùng: powershell -NoProfile -ExecutionPolicy Bypass -File outputs/smart-traffic/run-smart.ps1 [-Stop]
# PID file var/run-smart.pids: mỗi dòng "<PID>\t<tên>". -Stop diệt cả cây tiến trình (taskkill /T /F), có timeout.
param(
    [switch]$Stop,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Thua
)
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }   # console PS 5.1 hiển thị đúng tiếng Việt
$env:PYTHONDONTWRITEBYTECODE = '1'   # không sinh __pycache__ (QA vệ sinh yêu cầu sạch)
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Smart = Join-Path $Root 'outputs\smart-traffic'
$Backend = Join-Path $Smart 'backend'
$Web = Join-Path $Smart 'web'
$VarDir = Join-Path $Smart 'var'
$PidFile = Join-Path $VarDir 'run-smart.pids'
$StaticPort = 8821; $ApiPort = 8900; $WebPort = 5173
$GioiHan = 20   # giây tối đa cho taskkill và chờ tiến trình

function Test-CongMo([int]$Cong) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect('127.0.0.1', $Cong, $null, $null)
        if (-not $iar.AsyncWaitHandle.WaitOne(1000)) { return $false }
        $client.EndConnect($iar)
        return $true
    } catch { return $false } finally { $client.Close() }
}

function Fail([string]$ThongBao) {
    Write-Host "run-smart LỖI: $ThongBao"
    exit 1
}

function Ghi-TienTrinh([int]$Ma, [string]$Ten) {
    [System.IO.File]::AppendAllText($PidFile, "$Ma`t$Ten`r`n")
    Write-Host "run-smart: đã bật $Ten (PID $Ma)"
}

function Stop-All {
    if (-not (Test-Path $PidFile)) { Write-Host 'run-smart: không có PID file, không có gì để tắt.'; return }
    foreach ($dong in [System.IO.File]::ReadAllLines($PidFile)) {
        $phan = $dong -split "`t"
        if (-not $phan[0].Trim()) { continue }
        $ma = [int]$phan[0]
        $ten = if ($phan.Length -gt 1) { $phan[1] } else { '' }
        $tien = Get-Process -Id $ma -ErrorAction SilentlyContinue
        if (-not $tien) { Write-Host "run-smart: $ten (PID $ma) đã dừng trước đó"; continue }
        if ($tien.ProcessName -notin @('python', 'node')) {
            Write-Host "run-smart: bỏ qua PID $ma ($($tien.ProcessName)), không phải tiến trình của run-smart"
            continue
        }
        $tk = Start-Process -FilePath 'taskkill.exe' -ArgumentList "/PID $ma /T /F" -NoNewWindow -PassThru
        $null = $tk.Handle   # đọc handle trước để ExitCode còn lấy được sau WaitForExit(ms)
        if (-not $tk.WaitForExit($GioiHan * 1000)) {
            try { $tk.Kill() } catch { }
            Write-Host "run-smart: taskkill quá $GioiHan giây với $ten (PID $ma), đã bỏ qua"
            continue
        }
        if ($tk.ExitCode -eq 0) { Write-Host "run-smart: đã tắt $ten (PID $ma và cây tiến trình con)" }
        else { Write-Host "run-smart: không tắt được $ten (PID $ma), exit $($tk.ExitCode)" }
    }
    Remove-Item $PidFile -Force
    Write-Host 'run-smart: đã tắt xong.'
}

if ($Stop -or ($Thua -contains '--stop')) { Stop-All; exit 0 }

# Kiểm cổng TRƯỚC khi ghi lại PID file, để không mất dấu vết tiến trình cũ.
foreach ($mucCong in @(@($StaticPort, 'server tĩnh 3D'), @($ApiPort, 'backend API'), @($WebPort, 'web build'))) {
    if (Test-CongMo $mucCong[0]) { Fail "cổng $($mucCong[0]) đang bận ($($mucCong[1])). Chạy -Stop trước." }
}
New-Item -ItemType Directory -Force -Path $VarDir | Out-Null
[System.IO.File]::WriteAllText($PidFile, '')

Write-Host 'run-smart: (a) server tĩnh ...'
$env:PORT = "$StaticPort"
$serve = Join-Path $Root 'outputs\hcmc-poc\serve.py'
$p = Start-Process -FilePath 'python' -ArgumentList "`"$serve`"" -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $VarDir 'run-smart-static.log') -RedirectStandardError (Join-Path $VarDir 'run-smart-static.err.log')
Ghi-TienTrinh $p.Id 'static'

$VenvPy = Join-Path $Backend '.venv\Scripts\python.exe'
if (-not (Test-Path $VenvPy)) {
    Write-Host 'run-smart: (b) tạo .venv backend ...'
    & python -m venv (Join-Path $Backend '.venv')
    if ($LASTEXITCODE -ne 0) { Fail 'không tạo được .venv' }
}
& $VenvPy -c "import fastapi, uvicorn" | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'run-smart: (b) pip install -r requirements.txt ...'
    & $VenvPy -m pip install -q -r (Join-Path $Backend 'requirements.txt')
    if ($LASTEXITCODE -ne 0) { Fail 'pip install thất bại' }
}

Write-Host 'run-smart: (b) init DB + seed ...'
$env:SMART_VAR_DIR = $VarDir
Push-Location $Backend
& $VenvPy -c "from app.db import init_db, get_conn; c = get_conn(); init_db(c); c.close(); from app.seed.run_seed import run_seed; run_seed()"
$rc = $LASTEXITCODE
Pop-Location
if ($rc -ne 0) { Fail 'init/seed DB thất bại' }

Write-Host 'run-smart: (b) backend API ...'
$env:SMART_ALLOWED_ORIGINS = "http://127.0.0.1:$StaticPort,http://localhost:$StaticPort,http://127.0.0.1:$WebPort,http://localhost:$WebPort"
$p = Start-Process -FilePath $VenvPy -ArgumentList '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', "$ApiPort" `
    -WorkingDirectory $Backend -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $VarDir 'run-smart-api.log') -RedirectStandardError (Join-Path $VarDir 'run-smart-api.err.log')
Ghi-TienTrinh $p.Id 'api'

if (-not (Test-Path (Join-Path $Web 'node_modules'))) {
    Write-Host 'run-smart: (c) npm ci ...'
    Push-Location $Web; & npm.cmd ci; $rc = $LASTEXITCODE; Pop-Location
    if ($rc -ne 0) { Fail 'npm ci thất bại' }
}
Write-Host 'run-smart: (c) npm run build ...'
Push-Location $Web; & npm.cmd run build; $rc = $LASTEXITCODE; Pop-Location
if ($rc -ne 0) { Fail 'npm run build thất bại' }

Write-Host 'run-smart: (c) vite preview ...'
$vite = Join-Path $Web 'node_modules\vite\bin\vite.js'
$p = Start-Process -FilePath 'node' -ArgumentList "`"$vite`"", 'preview', '--port', "$WebPort", '--host', '127.0.0.1' `
    -WorkingDirectory $Web -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $VarDir 'run-smart-web.log') -RedirectStandardError (Join-Path $VarDir 'run-smart-web.err.log')
Ghi-TienTrinh $p.Id 'web'

Write-Host 'run-smart: chờ dịch vụ lên ...'
foreach ($cong in @($StaticPort, $ApiPort, $WebPort)) {
    $ok = $false
    for ($i = 0; $i -lt 30; $i++) { if (Test-CongMo $cong) { $ok = $true; break }; Start-Sleep -Seconds 1 }
    if (-not $ok) { Fail "cổng $cong không lên sau 30s, xem log trong $VarDir (rồi chạy -Stop)" }
}

Write-Host ''
Write-Host 'run-smart OK:'
Write-Host "  Trang 3D:       http://127.0.0.1:$StaticPort/hcmc-poc/?app=smart&api=http://127.0.0.1:$ApiPort"
Write-Host "  Web công an:    http://127.0.0.1:$WebPort/index-officer.html"
Write-Host "  Web người dân:  http://127.0.0.1:$WebPort/index-citizen.html"
Write-Host '  Tắt:            powershell -NoProfile -ExecutionPolicy Bypass -File outputs/smart-traffic/run-smart.ps1 -Stop'
