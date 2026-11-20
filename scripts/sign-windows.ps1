param(
  [Parameter(Mandatory = $true)]
  [string]$FilePath
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:WINDOWS_SIGN_CERT_BASE64) -or [string]::IsNullOrWhiteSpace($env:WINDOWS_SIGN_CERT_PASSWORD)) {
  Write-Host "Skipping Authenticode signing for $FilePath (WINDOWS_SIGN_CERT_BASE64 / WINDOWS_SIGN_CERT_PASSWORD not set)."
  exit 0
}

$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending |
  Select-Object -First 1 -ExpandProperty FullName

if (-not $signtool) {
  throw "signtool.exe was not found under Windows Kits 10."
}

$pfxPath = Join-Path ([System.IO.Path]::GetTempPath()) ("rustpad-sign-" + [System.Guid]::NewGuid().ToString("N") + ".pfx")
try {
  [System.IO.File]::WriteAllBytes($pfxPath, [System.Convert]::FromBase64String($env:WINDOWS_SIGN_CERT_BASE64))
  & $signtool sign /f $pfxPath /p $env:WINDOWS_SIGN_CERT_PASSWORD /fd SHA256 /tr "http://timestamp.digicert.com" /td SHA256 $FilePath
  if ($LASTEXITCODE -ne 0) {
    throw "signtool exited with code $LASTEXITCODE"
  }
} finally {
  if (Test-Path $pfxPath) {
    Remove-Item -Force $pfxPath
  }
}
