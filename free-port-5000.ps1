# Free port 5000 (Windows, manual use).
#
# The npm scripts no longer call this file — `predev` runs
# `node scripts/free-port.mjs`, which does the same job on every OS.
# It is kept only as a hand-run convenience.
#
# Two behaviours were removed because they caused real damage:
#
#   * It killed EVERY `node` / `tsx` / `nodemon` process on the machine, not
#     just the one holding :5000 — taking out the client dev server and any
#     unrelated Node project with it.
#   * It finished by running `nodemon index.ts`, so a script whose job was to
#     free the port immediately re-bound it. Running it before `npm run dev`
#     was itself the cause of "Port 5000 is already in use".
#
# Run from PowerShell:  .\free-port-5000.ps1

$Port = 5000

Write-Host "=== Freeing port $Port ===" -ForegroundColor Cyan

$owners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

if (-not $owners) {
    Write-Host "Nothing is listening on port $Port." -ForegroundColor Green
    exit 0
}

foreach ($procId in $owners) {
    $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
    Write-Host "Killing PID $procId ($name) bound to :$Port..." -ForegroundColor Yellow
    try {
        Stop-Process -Id $procId -Force -ErrorAction Stop
    } catch {
        Write-Host "  -> could not kill PID $procId : $_" -ForegroundColor Red
    }
}

Start-Sleep -Seconds 1

$stillBound = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($stillBound) {
    Write-Host "Port $Port is STILL bound. Try running PowerShell as Administrator." -ForegroundColor Red
    exit 1
}

Write-Host "Port $Port is free. Start the server with: npm run dev" -ForegroundColor Green
