# Free port 5000 and start the server cleanly.
# Run from PowerShell: .\free-port-5000.ps1

Write-Host "=== Killing any process holding port 5000 ===" -ForegroundColor Cyan

$listeners = netstat -ano | Select-String ":5000.*LISTENING"
if ($listeners) {
    foreach ($line in $listeners) {
        # Last whitespace-separated token is the PID
        $parts = ($line -replace "\s+", " ").Trim().Split(" ")
        $pid = $parts[-1]
        Write-Host "Killing PID $pid (was bound to :5000)..." -ForegroundColor Yellow
        try {
            Stop-Process -Id $pid -Force -ErrorAction Stop
        } catch {
            Write-Host "  -> could not kill PID $pid : $_" -ForegroundColor Red
        }
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "Nothing is listening on port 5000." -ForegroundColor Green
}

# Belt-and-braces: kill any orphaned tsx/nodemon/node still around
foreach ($name in @("tsx", "nodemon", "node")) {
    Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host "Killing leftover $name (PID $($_.Id))..." -ForegroundColor Yellow
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}
Start-Sleep -Seconds 1

Write-Host ""
Write-Host "=== Confirming port 5000 is free ===" -ForegroundColor Cyan
$stillBound = netstat -ano | Select-String ":5000.*LISTENING"
if ($stillBound) {
    Write-Host "Port 5000 is STILL bound:" -ForegroundColor Red
    $stillBound | ForEach-Object { Write-Host "  $_" }
    Write-Host "Try restarting PowerShell as Administrator, then re-run this script." -ForegroundColor Red
    exit 1
} else {
    Write-Host "Port 5000 is free." -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Starting nodemon ===" -ForegroundColor Cyan
Set-Location $PSScriptRoot
nodemon index.ts
