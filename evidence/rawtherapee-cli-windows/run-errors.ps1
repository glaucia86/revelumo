# Sequential negative cases; writes only to a new experiment folder.
param(
    [Parameter(Mandatory)][string]$Cli,
    [Parameter(Mandatory)][string]$Fixture,
    [Parameter(Mandatory)][string]$ExistingOutput,
    [Parameter(Mandatory)][string]$Experiment
)
$ErrorActionPreference = 'Stop'
$cliPath = (Resolve-Path -LiteralPath $Cli).Path
$inputPath = (Resolve-Path -LiteralPath $Fixture).Path
$existing = (Resolve-Path -LiteralPath $ExistingOutput).Path
$root = [IO.Path]::GetFullPath($Experiment)
if (Test-Path -LiteralPath $root) { throw 'Use a new experiment directory.' }
$originalBefore = (Get-FileHash -LiteralPath $inputPath).Hash
if ($originalBefore.ToLower() -ne 'b0800a1166b952430b255600373573e1d528adf8de98857781e06a98472b3c35') { throw 'Fixture SHA-256 does not match the recorded CC0 sample.' }
$existingBefore = (Get-FileHash -LiteralPath $existing).Hash
New-Item -ItemType Directory -Path $root | Out-Null
$truncated = Join-Path $root 'truncated.nef'
$stream = [IO.File]::OpenRead($inputPath)
try { $head = [byte[]]::new(1024); [void]$stream.Read($head, 0, $head.Length); [IO.File]::WriteAllBytes($truncated, $head) } finally { $stream.Dispose() }
$parentFile = Join-Path $root 'parent-is-file'
[IO.File]::WriteAllText($parentFile, 'This regular file prevents creation of a child output path.')
$cases = @(
    @{name='missing-input';input=(Join-Path $root 'missing.nef');output=(Join-Path $root 'missing.jpg')},
    @{name='truncated-input';input=$truncated;output=(Join-Path $root 'truncated.jpg')},
    @{name='existing-output';input=$inputPath;output=$existing},
    @{name='invalid-output-parent';input=$inputPath;output=(Join-Path $parentFile 'output.jpg')}
)
$results = @()
foreach ($case in $cases) {
    $start = [Diagnostics.ProcessStartInfo]::new($cliPath)
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.Environment['OMP_NUM_THREADS'] = '2'
    $start.Environment['RT_SETTINGS'] = Join-Path $root ($case.name + '-settings')
    $start.Environment['RT_CACHE'] = Join-Path $root ($case.name + '-cache')
    foreach ($arg in @('-o', $case.output, '-j92', '-js3', '-c', $case.input)) { $start.ArgumentList.Add($arg) }
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $start
    $timer = [Diagnostics.Stopwatch]::StartNew()
    [void]$process.Start()
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $timedOut = -not $process.WaitForExit(30000)
    if ($timedOut) { $process.Kill($true) }
    $process.WaitForExit()
    $timer.Stop()
    $record = [ordered]@{name=$case.name;command=@($cliPath,'-o',$case.output,'-j92','-js3','-c',$case.input);exitCode=$process.ExitCode;timedOut=$timedOut;elapsedMs=$timer.ElapsedMilliseconds;stdout=$stdout.Result;stderr=$stderr.Result;outputExists=(Test-Path -LiteralPath $case.output)}
    $results += $record
    $record | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 (Join-Path $root ($case.name + '.json'))
    $process.Dispose()
}
$originalAfter = (Get-FileHash -LiteralPath $inputPath).Hash
$existingAfter = (Get-FileHash -LiteralPath $existing).Hash
[ordered]@{cases=$results;originalBefore=$originalBefore;originalAfter=$originalAfter;existingBefore=$existingBefore;existingAfter=$existingAfter} | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 (Join-Path $root 'errors.json')
if ($originalBefore -ne $originalAfter -or $existingBefore -ne $existingAfter) { throw 'Original or pre-existing output changed.' }
