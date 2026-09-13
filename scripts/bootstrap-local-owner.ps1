$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$bootstrapScript = Join-Path $PSScriptRoot "bootstrap-local-owner.mjs"
$nodeCommand = Get-Command node -ErrorAction Stop
$nodePath = $nodeCommand.Source
$previousNodeEnv = $env:NODE_ENV
$env:NODE_ENV = "development"

$securePassword = $null
$passwordPointer = [IntPtr]::Zero
$plainPassword = $null
$payloadBytes = $null
$payload = $null
$payloadLine = $null
$accountEmail = $null
$process = $null

try {
  Push-Location $repoRoot
  & $nodePath $bootstrapScript --check
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Local-only checks failed; no account was changed."
    return
  }

  $accountEmail = Read-Host "Owner account email"
  if ([string]::IsNullOrWhiteSpace($accountEmail)) {
    Write-Host "An email is required; no account was changed."
    return
  }

  $securePassword = Read-Host "Password (input hidden)" -AsSecureString
  $passwordPointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $plainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $payload = ConvertTo-Json -InputObject @{
    email = $accountEmail.Trim()
    password = $plainPassword
  } -Compress
  $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  $payloadLine = [System.Convert]::ToBase64String($payloadBytes)

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $nodePath
  $startInfo.Arguments = "`"$bootstrapScript`""
  $startInfo.WorkingDirectory = $repoRoot
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) {
    Write-Host "Could not start the local bootstrap process."
    return
  }

  $outputTask = $process.StandardOutput.ReadToEndAsync()
  $errorTask = $process.StandardError.ReadToEndAsync()
  $process.StandardInput.WriteLine($payloadLine)
  $process.StandardInput.Close()
  $process.WaitForExit()

  $output = $outputTask.GetAwaiter().GetResult()
  $null = $errorTask.GetAwaiter().GetResult()
  if (-not [string]::IsNullOrWhiteSpace($output)) {
    Write-Host $output.Trim()
  }
  if ($process.ExitCode -ne 0) {
    Write-Host "Bootstrap stopped without confirming account creation."
  }
}
finally {
  if ($process) { $process.Dispose() }
  if ($passwordPointer -ne [IntPtr]::Zero) {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
  if ($securePassword) { $securePassword.Dispose() }
  if ($payloadBytes) { [System.Array]::Clear($payloadBytes, 0, $payloadBytes.Length) }
  $plainPassword = $null
  $payload = $null
  $payloadLine = $null
  $payloadBytes = $null
  $accountEmail = $null
  Pop-Location -ErrorAction SilentlyContinue
  if ($null -eq $previousNodeEnv) {
    Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
  } else {
    $env:NODE_ENV = $previousNodeEnv
  }
}
