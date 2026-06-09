# ============================================================================
# FreeQwenApi -- Start (check Node.js/npm, install deps, run server)
# ============================================================================
# Thin .ps1 behind start.bat. Same commands as the original batch file,
# wrapped in the shared ScriptKit console UI. Long-lived "run app" script:
# banner + steps only, no final summary / tray notification on success.
# ============================================================================

chcp 65001 | Out-Null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8

# Shared console UI + helpers. Vendored next to this script.
$kit = Join-Path $PSScriptRoot 'ScriptKit.ps1'
if (Test-Path -LiteralPath $kit) { . $kit }

Set-Location -LiteralPath $PSScriptRoot

$Host.UI.RawUI.WindowTitle = 'Запуск Qwen API сервера'

Write-Banner "FreeQwenApi  Start" "Check Node.js/npm -> npm install -> node index.js"

$totalSteps = 3

# --- Step 1: Check Node.js / npm -------------------------------------------
Write-Step 1 $totalSteps "Проверка наличия Node.js и npm"
where.exe node > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "[ОШИБКА] Node.js не установлен!"
    Write-Info "Пожалуйста, установите Node.js с сайта https://nodejs.org/"
    Show-Notification -Title 'FreeQwenApi FAILED' -Body 'Node.js не установлен.' -IsError
    exit 1
}
where.exe npm > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Fail "[ОШИБКА] npm не установлен!"
    Write-Info "Пожалуйста, переустановите Node.js с сайта https://nodejs.org/"
    Show-Notification -Title 'FreeQwenApi FAILED' -Body 'npm не установлен.' -IsError
    exit 1
}
Write-Ok "Node.js и npm найдены"

# --- Step 2: Install dependencies ------------------------------------------
Write-Step 2 $totalSteps "Установка зависимостей (npm install)"
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Fail "[ОШИБКА] Не удалось установить зависимости!"
    Show-Notification -Title 'FreeQwenApi FAILED' -Body 'npm install не удался.' -IsError
    exit 1
}
Write-Ok "Зависимости установлены"

# --- Step 3: Run the application -------------------------------------------
Write-Step 3 $totalSteps "Запуск приложения (node index.js)"
node index.js

# Console hold ('pause' in the original) is handled by the .bat launcher.
