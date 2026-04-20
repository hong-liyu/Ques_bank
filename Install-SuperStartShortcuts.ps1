param(
    [switch]$Remove,
    [switch]$DesktopOnly,
    [switch]$StartupOnly,
    [string]$IconLocation
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($DesktopOnly -and $StartupOnly) {
    throw "DesktopOnly and StartupOnly cannot be used together."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcherPath = Join-Path $scriptDir "SuperStart.vbs"

if (-not (Test-Path -LiteralPath $launcherPath)) {
    throw "SuperStart.vbs was not found: $launcherPath"
}

$desktopFolder = [Environment]::GetFolderPath("Desktop")
$startupFolder = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$shortcutName = "QuesBank Launcher.lnk"
$projectIcon = Join-Path $scriptDir "assets\quesbank.ico"
$defaultIcon = "$env:SystemRoot\System32\imageres.dll,184"

if (-not $IconLocation) {
    if (Test-Path -LiteralPath $projectIcon) {
        $IconLocation = $projectIcon
    } else {
        $IconLocation = $defaultIcon
    }
}

if (-not (Test-Path -LiteralPath $startupFolder)) {
    New-Item -ItemType Directory -Path $startupFolder | Out-Null
}

$desktopShortcut = Join-Path $desktopFolder $shortcutName
$startupShortcut = Join-Path $startupFolder $shortcutName

$targets = @()
if ($DesktopOnly) {
    $targets += $desktopShortcut
} elseif ($StartupOnly) {
    $targets += $startupShortcut
} else {
    $targets += $desktopShortcut
    $targets += $startupShortcut
}

function New-LauncherShortcut {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ShortcutPath,
        [Parameter(Mandatory = $true)]
        [string]$VbsPath,
        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory,
        [Parameter(Mandatory = $true)]
        [string]$ShortcutIconLocation
    )

    $wsh = New-Object -ComObject WScript.Shell
    $shortcut = $wsh.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = Join-Path $env:SystemRoot "System32\wscript.exe"
    $shortcut.Arguments = '"{0}"' -f $VbsPath
    $shortcut.WorkingDirectory = $WorkingDirectory
    $shortcut.Description = "Start QuesBank backend and frpc silently"
    $shortcut.IconLocation = $ShortcutIconLocation
    $shortcut.Save()
}

if ($Remove) {
    foreach ($target in $targets) {
        if (Test-Path -LiteralPath $target) {
            Remove-Item -LiteralPath $target -Force
            Write-Host "Removed: $target"
        } else {
            Write-Host "Not found (skip): $target"
        }
    }

    Write-Host "Done."
    exit 0
}

foreach ($target in $targets) {
    New-LauncherShortcut -ShortcutPath $target -VbsPath $launcherPath -WorkingDirectory $scriptDir -ShortcutIconLocation $IconLocation
    Write-Host "Created: $target"
}

Write-Host "Done."
Write-Host "Desktop shortcut: $desktopShortcut"
Write-Host "Startup shortcut: $startupShortcut"
Write-Host "Icon: $IconLocation"
