#Requires -Version 5.1
<#
.SYNOPSIS
    Aplica no servidor Windows um .zip da FrameHTML editado no Mac, com backup,
    conferencia de hash e reciclagem do Application Pool.

.DESCRIPTION
    Fluxo de volta (Mac -> servidor):
      1. (opcional) baixa o zip do bucket GCS;
      2. confere o SHA256 (se houver o arquivo .sha256 ao lado);
      3. faz backup da FrameHTML atual;
      4. extrai o zip em pasta temporaria;
      5. copia os arquivos por cima da FrameHTML;
      6. recicla o Application Pool do portal (evita iisreset em producao).

.PARAMETER ZipPath
    Caminho do .zip editado. Ex.: C:\temp\FrameHTML-editado-20260626-101500.zip

.PARAMETER FrameHtmlPath
    Pasta de destino. Padrao: C:\totvs\CorporeRM\FrameHTML

.PARAMETER BackupDir
    Pasta onde o backup sera criado. Padrao: D:\backups

.PARAMETER AppPool
    Nome do Application Pool do portal RM. Padrao: RMPortalAppPool

.PARAMETER GcsBucket
    (Opcional) Bucket de onde baixar o zip, ex.: gs://csa-transfer-portal

.EXAMPLE
    .\aplicar-framehtml.ps1 -ZipPath C:\temp\FrameHTML-editado-20260626-101500.zip

.EXAMPLE
    .\aplicar-framehtml.ps1 -ZipPath C:\temp\FrameHTML-editado-20260626-101500.zip -GcsBucket gs://csa-transfer-portal
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ZipPath,
    [string]$FrameHtmlPath = 'C:\totvs\CorporeRM\FrameHTML',
    [string]$BackupDir     = 'D:\backups',
    [string]$AppPool       = 'RMPortalAppPool',
    [string]$GcsBucket     = ''
)

$ErrorActionPreference = 'Stop'

# 1. Baixa do bucket, se necessario.
if ($GcsBucket -and -not (Test-Path -LiteralPath $ZipPath)) {
    $zipName = Split-Path $ZipPath -Leaf
    $zipDir  = Split-Path $ZipPath -Parent
    if (-not $zipDir) { $zipDir = (Get-Location).Path; $ZipPath = Join-Path $zipDir $zipName }
    Write-Host "Baixando $GcsBucket/$zipName ..." -ForegroundColor Cyan
    & gsutil cp "$GcsBucket/$zipName"          $zipDir
    & gsutil cp "$GcsBucket/$zipName.sha256"   $zipDir 2>$null
}

if (-not (Test-Path -LiteralPath $ZipPath)) {
    throw "Zip nao encontrado: $ZipPath"
}

# 2. Confere o hash, se houver .sha256 ao lado.
$shaFile = "$ZipPath.sha256"
if (Test-Path -LiteralPath $shaFile) {
    $expected = ((Get-Content $shaFile -Raw).Trim()).ToUpperInvariant()
    $actual   = (Get-FileHash $ZipPath -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($expected -ne $actual) {
        throw "Hash divergente! Esperado $expected, obtido $actual. Transferencia corrompida."
    }
    Write-Host 'Hash conferido: OK' -ForegroundColor Green
} else {
    Write-Warning 'Arquivo .sha256 nao encontrado: pulando conferencia de integridade.'
}

# 3. Backup da FrameHTML atual.
if (-not (Test-Path -LiteralPath $BackupDir)) {
    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
}
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup    = Join-Path $BackupDir "FrameHTML-backup-$timestamp"
Write-Host "Backup de '$FrameHtmlPath' -> '$backup' ..." -ForegroundColor Cyan
Copy-Item -LiteralPath $FrameHtmlPath -Destination $backup -Recurse -Force

# 4. Extrai o zip em pasta temporaria.
$tmp = Join-Path $env:TEMP "framehtml-apply-$timestamp"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $tmp)

# O zip foi criado com a pasta-base FrameHTML\ na raiz.
$src = Join-Path $tmp 'FrameHTML'
if (-not (Test-Path -LiteralPath $src)) { $src = $tmp }   # fallback se foi zipado sem a base

# 5. Copia por cima da FrameHTML de destino.
Write-Host "Copiando arquivos para '$FrameHtmlPath' ..." -ForegroundColor Cyan
Copy-Item -Path (Join-Path $src '*') -Destination $FrameHtmlPath -Recurse -Force

# 6. Recicla o Application Pool (evita iisreset em producao).
try {
    Import-Module WebAdministration -ErrorAction Stop
    Restart-WebAppPool -Name $AppPool
    Write-Host "Application Pool '$AppPool' reciclado." -ForegroundColor Green
} catch {
    Write-Warning "Nao foi possivel reciclar o pool '$AppPool': $($_.Exception.Message)"
    Write-Warning 'Recicle manualmente pelo IIS Manager se necessario.'
}

Remove-Item -LiteralPath $tmp -Recurse -Force
Write-Host ''
Write-Host 'Concluido.' -ForegroundColor Green
Write-Host "  Backup salvo em: $backup"
Write-Host '  Limpe o cache do navegador / use ?v= nas URLs customizadas se algo nao atualizar.'
