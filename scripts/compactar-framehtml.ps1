#Requires -Version 5.1
<#
.SYNOPSIS
    Compacta a pasta FrameHTML do TOTVS RM em um unico .zip integro para transporte ao Mac.

.DESCRIPTION
    O redirecionamento de pasta do Remote Desktop (drive \\tsclient) corrompe arquivos em
    copias multiplas, gerando arquivos de 0 bytes / so com bytes nulos. Este script evita o
    problema empacotando TODA a arvore em um unico arquivo .zip (que sobrevive ao transporte),
    calcula o hash SHA256 para conferencia nas duas pontas e, opcionalmente, envia o zip para
    um bucket do Google Cloud Storage (recomendado para a VM Windows no GCP).

.PARAMETER FrameHtmlPath
    Caminho da pasta FrameHTML no servidor. Padrao: C:\totvs\CorporeRM\FrameHTML

.PARAMETER OutputDir
    Pasta onde o .zip sera gerado. Padrao: C:\temp

.PARAMETER GcsBucket
    (Opcional) Bucket de transporte, ex.: gs://csa-transfer-portal
    Se informado, o zip e o .sha256 sao enviados via gsutil.

.EXAMPLE
    .\compactar-framehtml.ps1

.EXAMPLE
    .\compactar-framehtml.ps1 -GcsBucket gs://csa-transfer-portal
#>
[CmdletBinding()]
param(
    [string]$FrameHtmlPath = 'C:\totvs\CorporeRM\FrameHTML',
    [string]$OutputDir     = 'C:\temp',
    [string]$GcsBucket     = ''
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $FrameHtmlPath)) {
    throw "Pasta de origem nao encontrada: $FrameHtmlPath"
}
if (-not (Test-Path -LiteralPath $OutputDir)) {
    New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$zipPath   = Join-Path $OutputDir "FrameHTML-$timestamp.zip"

Write-Host "Compactando '$FrameHtmlPath'" -ForegroundColor Cyan
Write-Host "         -> '$zipPath'"      -ForegroundColor Cyan

# Usa System.IO.Compression para robustez com arvores grandes e para
# incluir a pasta-base (FrameHTML\) dentro do zip, facilitando a extracao.
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $FrameHtmlPath,
    $zipPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $true   # includeBaseDirectory => mantem 'FrameHTML\' como raiz dentro do zip
)

$hash = (Get-FileHash -Path $zipPath -Algorithm SHA256).Hash
$size = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)

# Grava o hash ao lado do zip (mesmo nome + .sha256), para conferencia no Mac.
$hash | Out-File -FilePath "$zipPath.sha256" -Encoding ascii -NoNewline

Write-Host ''
Write-Host 'Zip gerado com sucesso.' -ForegroundColor Green
Write-Host "  Arquivo : $zipPath"
Write-Host "  Tamanho : $size MB"
Write-Host "  SHA256  : $hash"

if ($GcsBucket) {
    Write-Host ''
    Write-Host "Enviando para $GcsBucket ..." -ForegroundColor Cyan
    & gsutil cp $zipPath          "$GcsBucket/"
    & gsutil cp "$zipPath.sha256" "$GcsBucket/"
    Write-Host 'Upload concluido.' -ForegroundColor Green
    Write-Host ''
    Write-Host 'No Mac, baixe e extraia com:' -ForegroundColor Yellow
    Write-Host "  ./scripts/mac-extrair.sh $(Split-Path $zipPath -Leaf) $GcsBucket"
} else {
    Write-Host ''
    Write-Host 'Transporte o arquivo .zip (e o .sha256) ate o Mac.' -ForegroundColor Yellow
    Write-Host 'NUNCA arraste arquivos soltos pelo RDP: use o zip unico.'
}
