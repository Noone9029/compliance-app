param(
    [Parameter(Mandatory = $true)]
    [string]$SourceFolder,

    [string]$OutputZip = ""
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $SourceFolder)) {
    throw "Source folder not found: $SourceFolder"
}

$sourcePath = (Resolve-Path $SourceFolder).Path
$folderName = Split-Path $sourcePath -Leaf

if ([string]::IsNullOrWhiteSpace($OutputZip)) {
    $OutputZip = Join-Path (Get-Location) "$folderName-upload.zip"
}

$tempDir = Join-Path $env:TEMP ("zipprep_" + [guid]::NewGuid().ToString())
$stagingDir = Join-Path $tempDir $folderName

New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null

$excludeDirs = @(
    "node_modules",
    ".git",
    ".turbo",
    ".next",
    "dist",
    "build",
    "coverage",
    ".logs",
    ".cache"
)

$excludeFiles = @(
    "*.log",
    "*.pid",
    "*.zip"
)

function Copy-CleanFolder {
    param(
        [string]$From,
        [string]$To
    )

    New-Item -ItemType Directory -Path $To -Force | Out-Null

    Get-ChildItem -LiteralPath $From -Force | ForEach-Object {
        $item = $_
        $destination = Join-Path $To $item.Name

        if ($item.PSIsContainer) {
            if ($excludeDirs -contains $item.Name) {
                return
            }
            Copy-CleanFolder -From $item.FullName -To $destination
        }
        else {
            foreach ($pattern in $excludeFiles) {
                if ($item.Name -like $pattern) {
                    return
                }
            }
            Copy-Item -LiteralPath $item.FullName -Destination $destination -Force
        }
    }
}

try {
    Copy-CleanFolder -From $sourcePath -To $stagingDir

    if (Test-Path $OutputZip) {
        Remove-Item $OutputZip -Force
    }

    Compress-Archive -Path $stagingDir -DestinationPath $OutputZip -Force
    Write-Host "ZIP created successfully: $OutputZip"
}
finally {
    if (Test-Path $tempDir) {
        Remove-Item $tempDir -Recurse -Force
    }
}