# Load MSVC environment (required for libz-sys, vswhom-sys, ssh2 on Windows)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Find-VcVars64 {
    $candidates = @(
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat"
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) { return $path }
    }

    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vswhere) {
        $installPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if ($installPath) {
            $fromVswhere = Join-Path $installPath "VC\Auxiliary\Build\vcvars64.bat"
            if (Test-Path $fromVswhere) { return $fromVswhere }
        }
    }

    return $null
}

$vcvars = Find-VcVars64
if (-not $vcvars) {
    Write-Host ""
    Write-Host "ERROR: MSVC (cl.exe) not found." -ForegroundColor Red
    Write-Host "Install Visual Studio 2022 Build Tools with 'Desktop development with C++':" -ForegroundColor Yellow
    Write-Host "  https://visualstudio.microsoft.com/visual-cpp-build-tools/" -ForegroundColor Cyan
    Write-Host ""
    exit 1
}

Write-Host "Using MSVC environment: $vcvars" -ForegroundColor DarkGray
cmd /c "`"$vcvars`" >nul && cd /d `"$root`" && npm run tauri dev"
exit $LASTEXITCODE
