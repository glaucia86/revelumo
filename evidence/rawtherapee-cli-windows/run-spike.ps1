# Requires an already approved/installed official RawTherapee 5.13 CLI.
# Does not download, install, accept terms, or change the product.
param(
    [Parameter(Mandatory)][string]$Cli,
    [Parameter(Mandatory)][string]$Fixture,
    [Parameter(Mandatory)][string]$Experiment
)
$ErrorActionPreference = 'Stop'
$expected = 'b0800a1166b952430b255600373573e1d528adf8de98857781e06a98472b3c35'
$cliPath = (Resolve-Path -LiteralPath $Cli).Path
$inputPath = (Resolve-Path -LiteralPath $Fixture).Path
$before = (Get-FileHash -LiteralPath $inputPath).Hash.ToLower()
if ($before -ne $expected) { throw 'Fixture SHA-256 does not match the recorded CC0 sample.' }
$root = [IO.Path]::GetFullPath($Experiment)
if (Test-Path -LiteralPath $root) { throw 'Use a new experiment directory; existing results are never overwritten.' }
if ($root.StartsWith($inputPath, [StringComparison]::OrdinalIgnoreCase)) { throw 'Experiment must be separate from the original.' }
New-Item -ItemType Directory -Path $root | Out-Null
$output = Join-Path $root 'derivative.jpg'
$start = [Diagnostics.ProcessStartInfo]::new($cliPath)
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$start.Environment['OMP_NUM_THREADS'] = '2'
$start.Environment['RT_SETTINGS'] = Join-Path $root 'settings'
$start.Environment['RT_CACHE'] = Join-Path $root 'cache'
foreach ($arg in @('-o', $output, '-j92', '-js3', '-c', $inputPath)) { $start.ArgumentList.Add($arg) }
$process = [Diagnostics.Process]::new()
$process.StartInfo = $start
$timer = [Diagnostics.Stopwatch]::StartNew()
[void]$process.Start()
$stdout = $process.StandardOutput.ReadToEndAsync()
$stderr = $process.StandardError.ReadToEndAsync()
$samples = [Collections.Generic.List[object]]::new()
$timedOut = $false
while (-not $process.WaitForExit(100)) {
    $process.Refresh()
    $samples.Add([ordered]@{elapsedMs=$timer.ElapsedMilliseconds;workingSetBytes=$process.WorkingSet64;privateBytes=$process.PrivateMemorySize64})
    if ($timer.Elapsed.TotalSeconds -ge 180) { $timedOut=$true; $process.Kill($true); break }
}
$process.WaitForExit()
$timer.Stop()
$outputText = $stdout.Result
$outputText | Set-Content -Encoding utf8 (Join-Path $root 'stdout.txt')
$stderr.Result | Set-Content -Encoding utf8 (Join-Path $root 'stderr.txt')
$after = (Get-FileHash -LiteralPath $inputPath).Hash.ToLower()
$result = [ordered]@{
    command=@($cliPath, '-o', $output, '-j92', '-js3', '-c', $inputPath)
    cliSha256=(Get-FileHash -LiteralPath $cliPath).Hash.ToLower()
    powershellVersion=$PSVersionTable.PSVersion.ToString()
    versionBanner=($outputText -split '\r?\n' | Where-Object { $_ -match '^RawTherapee, version ' } | Select-Object -First 1)
    ompNumThreads=2; exitCode=$process.ExitCode; timedOut=$timedOut
    elapsedMs=$timer.ElapsedMilliseconds; peakWorkingSetBytes=$process.PeakWorkingSet64
    samples=$samples.ToArray(); originalBefore=$before; originalAfter=$after
    originalUnchanged=($before -eq $after)
    output=if (Test-Path -LiteralPath $output) { @{bytes=(Get-Item -LiteralPath $output).Length;sha256=(Get-FileHash -LiteralPath $output).Hash.ToLower()} } else { $null }
    limits='One process only. Working set is not exclusive physical RAM. No post-exit retention, child process, offline, ICC, orientation, or visual validation is inferred.'
}
$result | ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 (Join-Path $root 'result.json')
$process.Dispose()
if ($before -ne $after) { throw 'Original changed: stop investigation.' }
if ($timedOut -or $result.exitCode -ne 0 -or $null -eq $result.output) { throw 'RAW conversion failed; inspect result.json and stderr.txt.' }
