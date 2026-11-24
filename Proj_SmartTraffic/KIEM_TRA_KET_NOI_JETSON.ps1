param(
    [string]$JetsonIp = "192.168.16.210"
)

$ping = Test-Connection -ComputerName $JetsonIp -Count 2 -Quiet -ErrorAction SilentlyContinue
$ssh = Test-NetConnection -ComputerName $JetsonIp -Port 22 -InformationLevel Quiet -WarningAction SilentlyContinue
$gpio = Test-NetConnection -ComputerName $JetsonIp -Port 8080 -InformationLevel Quiet -WarningAction SilentlyContinue

[PSCustomObject]@{
    JetsonIp = $JetsonIp
    Ping = if ($ping) { "OK" } else { "FAIL" }
    SSH_22 = if ($ssh) { "OPEN" } else { "CLOSED" }
    GpioService_8080 = if ($gpio) { "ONLINE" } else { "OFFLINE" }
} | Format-Table -AutoSize

if ($gpio) {
    Write-Host "Jetson GPIO service is online. This script did not change any GPIO state." -ForegroundColor Green
} elseif ($ping) {
    Write-Host "Jetson is reachable, but the GPIO service is not running on port 8080." -ForegroundColor Yellow
} else {
    Write-Host "Jetson is not reachable over the configured Ethernet network." -ForegroundColor Red
}
