<#
.SYNOPSIS
Copies JPEGs with a CreationTime date suffix for the temporary photo importer.
.EXAMPLE
pwsh -File scripts/prepare-photo-import.ps1 -SourceDirectory 'B:\Photos' -DestinationDirectory 'B:\PhotoImport' -WhatIf
.EXAMPLE
pwsh -File scripts/prepare-photo-import.ps1 -SourceDirectory 'B:\Photos' -DestinationDirectory 'B:\PhotoImport'
.NOTES
Reads only the immediate source directory. Originals are never renamed or modified.
After importing the old photos, remove this helper and the filename date fallback
in web/src/features/photo-import. The copied files can then be deleted separately.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [string] $SourceDirectory,
    [Parameter(Mandatory)]
    [string] $DestinationDirectory
)

$ErrorActionPreference = 'Stop'
$source = Get-Item -LiteralPath $SourceDirectory
if (-not $source.PSIsContainer) {
    throw 'SourceDirectory must be a directory.'
}
$sourcePath = [IO.Path]::TrimEndingDirectorySeparator($source.FullName)
$destinationPath = [IO.Path]::TrimEndingDirectorySeparator($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DestinationDirectory))
if ($destinationPath.Equals($sourcePath, [StringComparison]::OrdinalIgnoreCase) -or
    $destinationPath.StartsWith($sourcePath.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'DestinationDirectory must be separate from and outside SourceDirectory.'
}
if (Test-Path -LiteralPath $destinationPath) {
    if (-not (Get-Item -LiteralPath $destinationPath).PSIsContainer) {
        throw 'DestinationDirectory must be a directory.'
    }
}

$copies = @(foreach ($file in Get-ChildItem -LiteralPath $sourcePath -File) {
    if ($file.Extension -notmatch '^\.jpe?g$') { continue }
    if ($file.Name -match '^.+_\d{4}-\d{2}-\d{2}\.jpe?g$') {
        Write-Verbose "Skipping already suffixed file $($file.Name)"
        continue
    }
    $date = $file.CreationTime.ToString('yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture)
    $target = Join-Path $destinationPath ($file.BaseName + '_' + $date + $file.Extension)
    if (Test-Path -LiteralPath $target) {
        throw "Destination already exists. No files were copied: $target"
    }
    [PSCustomObject]@{ Source = $file.FullName; Target = $target }
})
if ($copies.Count -gt 0 -and -not (Test-Path -LiteralPath $destinationPath)) {
    if ($PSCmdlet.ShouldProcess($destinationPath, 'Create destination directory')) {
        [IO.Directory]::CreateDirectory($destinationPath) | Out-Null
    }
}
foreach ($copy in $copies) {
    if ($PSCmdlet.ShouldProcess($copy.Target, "Copy $($copy.Source)")) {
        [IO.File]::Copy($copy.Source, $copy.Target, $false)
    }
}
