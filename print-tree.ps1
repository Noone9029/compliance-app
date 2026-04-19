param(
    [string]$Root = ".",
    [string]$OutputFile = "project-structure.txt"
)

$ErrorActionPreference = "Stop"

$IgnoreDirs = @(
    ".git",
    "node_modules",
    ".next",
    "dist",
    "build",
    "coverage",
    ".turbo",
    ".idea",
    ".vscode",
    "__pycache__"
)

$IgnoreFiles = @(
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock"
)

function Write-Tree {
    param(
        [string]$Path,
        [string]$Prefix = ""
    )

    $items = Get-ChildItem -LiteralPath $Path -Force |
        Where-Object {
            if ($_.PSIsContainer) {
                $IgnoreDirs -notcontains $_.Name
            } else {
                $IgnoreFiles -notcontains $_.Name
            }
        } |
        Sort-Object @{Expression = {$_.PSIsContainer}; Descending = $true}, Name

    for ($i = 0; $i -lt $items.Count; $i++) {
        $item = $items[$i]
        $isLast = ($i -eq $items.Count - 1)

        $branch = if ($isLast) { "\-- " } else { "+-- " }
        $line = "$Prefix$branch$($item.Name)"
        Add-Content -LiteralPath $OutputFile -Value $line

        if ($item.PSIsContainer) {
            $nextPrefix = if ($isLast) { "$Prefix    " } else { "$Prefix|   " }
            Write-Tree -Path $item.FullName -Prefix $nextPrefix
        }
    }
}

if (Test-Path -LiteralPath $OutputFile) {
    Remove-Item -LiteralPath $OutputFile -Force
}

$rootItem = Get-Item -LiteralPath $Root
Set-Content -LiteralPath $OutputFile -Value $rootItem.Name
Write-Tree -Path $rootItem.FullName

Write-Host "Done. Output saved to $OutputFile"