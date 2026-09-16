param(
    [Parameter(Mandatory = $true)][ValidateSet('Install', 'Launch', 'Share')][string]$Action,
    [switch]$NoBrowser,
    [string]$Port
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot '.runtime'
$nodeFolder = Join-Path $runtimeRoot 'node'
$nodeExe = Join-Path $nodeFolder 'node.exe'
Set-Location -LiteralPath $projectRoot

function Get-SiteRoot {
    foreach ($folder in @('dist', 'site')) {
        $candidate = Join-Path $projectRoot $folder
        if (Test-Path -LiteralPath (Join-Path $candidate 'index.html')) { return $candidate }
    }
    throw 'The built editor is missing. Run Install Dependencies.bat first.'
}

function Assert-OfficeAssets([string]$SiteRoot) {
    foreach ($asset in @('soffice.js', 'soffice.wasm', 'soffice.data', 'soffice.data.js.metadata')) {
        if (!(Test-Path -LiteralPath (Join-Path $SiteRoot "office\runtime\$asset"))) {
            throw "The Office engine is incomplete ($asset missing). Extract the complete bide ZIP, then run Install Dependencies.bat."
        }
    }
}

function Get-DownloadHash([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
    finally { $sha.Dispose(); $stream.Dispose() }
}

function Install-PrivateNode {
    if ((Test-Path -LiteralPath $nodeExe) -and (Test-Path -LiteralPath (Join-Path $nodeFolder 'node_modules\npm\bin\npm-cli.js'))) {
        $version = & $nodeExe --version
        if ($LASTEXITCODE -eq 0 -and $version -match '^v24\.') {
            Write-Host "Using private Node.js $version."
            return
        }
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $architecture = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432) { $architecture = $env:PROCESSOR_ARCHITEW6432 }
    if ($architecture -eq 'ARM64') { $platform = 'arm64' }
    elseif ($architecture -eq 'AMD64') { $platform = 'x64' }
    else { throw 'This version requires 64-bit Windows (x64 or ARM64).' }
    Write-Host 'Downloading private Node.js from nodejs.org (no administrator rights needed)...'
    $releases = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 60
    $release = $releases | Where-Object { $_.version -match '^v24\.\d+\.\d+$' -and $_.lts } | Select-Object -First 1
    if (!$release) { throw 'Could not find a supported Node.js 24 LTS release.' }
    $baseName = "node-$($release.version)-win-$platform"
    $archiveName = "$baseName.zip"
    $downloadRoot = Join-Path $runtimeRoot 'downloads'
    New-Item -ItemType Directory -Path $downloadRoot -Force | Out-Null
    $archivePath = Join-Path $downloadRoot $archiveName
    $baseUrl = "https://nodejs.org/dist/$($release.version)"
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/SHASUMS256.txt" -TimeoutSec 60).Content
    $checksumLine = $checksums -split "`n" | Where-Object { $_.Trim().EndsWith(" $archiveName") } | Select-Object -First 1
    if (!$checksumLine) { throw 'The official Node.js checksum is missing. Nothing was installed.' }
    $expectedHash = ($checksumLine.Trim() -split '\s+')[0]
    if ($expectedHash -notmatch '^[a-fA-F0-9]{64}$') { throw 'Invalid Node.js checksum response.' }
    $cached = (Test-Path -LiteralPath $archivePath) -and ((Get-DownloadHash $archivePath) -eq $expectedHash)
    if (!$cached) { Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$archiveName" -OutFile $archivePath -TimeoutSec 300 }
    if ((Get-DownloadHash $archivePath) -ne $expectedHash) { throw 'Node.js download verification failed. Run the installer again.' }
    $extractRoot = Join-Path $downloadRoot ([Guid]::NewGuid().ToString('N'))
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($archivePath, $extractRoot)
    $extractedNode = Join-Path $extractRoot $baseName
    New-Item -ItemType Directory -Path $nodeFolder -Force | Out-Null
    Get-ChildItem -LiteralPath $extractedNode | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $nodeFolder -Recurse -Force }
    $version = & $nodeExe --version
    if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v24\.') { throw 'The private Node.js runtime could not start.' }
    Write-Host "Installed private Node.js $version in .runtime\node."
}

function Read-ServerStatus([int]$Port) {
    try { return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/__bide/status" -TimeoutSec 2 }
    catch {
        # Reuse an already running pre-rename server, retaining its browser autosave origin.
        try { return Invoke-RestMethod -Uri "http://127.0.0.1:$Port/__folio/status" -TimeoutSec 2 }
        catch { return $null }
    }
}

function Test-PortBusy([int]$Port) {
    $client = New-Object Net.Sockets.TcpClient
    try {
        $attempt = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (!$attempt.AsyncWaitHandle.WaitOne(250)) { return $false }
        $client.EndConnect($attempt)
        return $true
    } catch { return $false }
    finally { $client.Close() }
}

try {
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    if ($Action -eq 'Install') {
        Write-Host 'bide - install local dependencies'
        Install-PrivateNode
        if (Test-Path -LiteralPath (Join-Path $projectRoot 'package.json')) {
            # The distribution stores its large Office runtime once, in ../site.
            $officeTarget = Join-Path $projectRoot 'public\office\runtime'
            if (!(Test-Path -LiteralPath (Join-Path $officeTarget 'soffice.wasm'))) {
                $officeSource = Join-Path (Split-Path -Parent $projectRoot) 'site\office\runtime'
                if (Test-Path -LiteralPath $officeSource) {
                    New-Item -ItemType Directory -Path $officeTarget -Force | Out-Null
                    Get-ChildItem -LiteralPath $officeSource | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $officeTarget -Force }
                }
            }
            & $nodeExe (Join-Path $PSScriptRoot 'fetch-office.mjs')
            if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the browser Office engine. See the download message above.' }
            $env:Path = "$nodeFolder;$env:Path"
            $env:npm_config_cache = Join-Path $runtimeRoot 'npm-cache'
            $env:npm_config_update_notifier = 'false'
            Write-Host 'Installing locked browser dependencies...'
            # Native addon install scripts are unnecessary for the browser build.
            & $nodeExe (Join-Path $nodeFolder 'node_modules\npm\bin\npm-cli.js') ci --ignore-scripts --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check your connection to registry.npmjs.org and run this file again.' }
            & $nodeExe (Join-Path $nodeFolder 'node_modules\npm\bin\npm-cli.js') run build
            if ($LASTEXITCODE -ne 0) { throw 'The editor build failed. See the build message above.' }
        } else { Write-Host 'Using the prebuilt editor. No npm packages need to be installed.' }
        $siteRoot = Get-SiteRoot
        Assert-OfficeAssets $siteRoot
        Write-Host ''
        Write-Host 'Ready. Double-click launch bide.bat.' -ForegroundColor Green
        Write-Host 'No system PATH changes, Python, or installed Office software are required.'
        exit 0
    }

    if (!(Test-Path -LiteralPath $nodeExe)) { throw 'Run Install Dependencies.bat once before launching bide.' }
    $siteRoot = Get-SiteRoot
    Assert-OfficeAssets $siteRoot
    if ($Action -eq 'Share') {
        $env:BIDE_ROOT = $siteRoot
        $serverArgs = @((Join-Path $PSScriptRoot 'serve.mjs'), '--lan')
        if ($Port) {
            if ($Port -notmatch '^\d+$' -or [long]$Port -lt 1024 -or [long]$Port -gt 65535) { throw 'Choose a LAN port from 1024 to 65535.' }
            $serverArgs += @('--port', $Port)
        }
        & $nodeExe @serverArgs
        exit $LASTEXITCODE
    }
    $statePath = Join-Path $runtimeRoot 'server.json'
    $ports = @(8766..8785)
    if (Test-Path -LiteralPath $statePath) {
        try {
            $previous = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
            if ($previous.port -ge 8766 -and $previous.port -le 8785) { $ports = @([int]$previous.port) + @($ports | Where-Object { $_ -ne $previous.port }) }
        } catch { }
    }
    $port = $null
    $running = $false
    foreach ($candidate in $ports) {
        if (Test-PortBusy $candidate) {
            $status = Read-ServerStatus $candidate
            if ($status -and @('bide-browser','folio-studio-browser') -contains $status.application -and $status.root -eq $siteRoot) { $port = $candidate; $running = $true; break }
        } else { $port = $candidate; break }
    }
    if (!$port) { throw 'All local ports 8766-8785 are busy. Close another local preview and try again.' }
    if (!$running) {
        $env:BIDE_PORT = [string]$port
        $env:BIDE_ROOT = $siteRoot
        $serverProcess = Start-Process -FilePath $nodeExe -ArgumentList 'scripts/serve.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeRoot 'server.log') -RedirectStandardError (Join-Path $runtimeRoot 'server-error.log') -PassThru
        $ready = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            if ($serverProcess.HasExited) { throw 'The local server stopped. See .runtime\server-error.log.' }
            $status = Read-ServerStatus $port
            if ($status -and $status.application -eq 'bide-browser' -and $status.root -eq $siteRoot) { $ready = $true; break }
            Start-Sleep -Milliseconds 250
        }
        if (!$ready) { throw 'The local server did not become ready. See .runtime\server-error.log.' }
        @{ port = $port; pid = $serverProcess.Id; root = $siteRoot } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
    }
    $url = "http://127.0.0.1:$port"
    # The server is hidden; the editor is the interactive window requested by the user.
    if (!$NoBrowser) { Start-Process -FilePath $url -WindowStyle Normal }
    Write-Host "bide is running at $url"
    Write-Host 'The launcher can close. Your local server keeps running until Windows shuts down.'
    exit 0
} catch {
    Write-Host ''
    Write-Host ("bide: " + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
