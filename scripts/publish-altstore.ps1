param(
    [string]$IpaPath = "d:\Ostia\altstore\ostia.ipa",
    [string]$IpaUrl = "https://ostia.opensaas.cc/ostia.ipa",
    [string]$SourceUrl = "https://ostia.opensaas.cc/altstore.json",
    [string]$Output = "d:\Ostia\altstore\altstore.json"
)

if (-not (Test-Path $IpaPath)) {
    Write-Host "未找到 IPA 文件: $IpaPath"
    exit 1
}

$env:ALTSTORE_IPA_PATH = $IpaPath
$env:ALTSTORE_IPA_URL = $IpaUrl
$env:ALTSTORE_SOURCE_URL = $SourceUrl
$env:ALTSTORE_OUTPUT = $Output

pnpm altstore:source
