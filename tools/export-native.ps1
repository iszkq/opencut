[CmdletBinding()]
param(
	[Parameter(Mandatory)]
	[ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
	[string]$Video,

	[ValidateScript({ -not $_ -or (Test-Path -LiteralPath $_ -PathType Leaf) })]
	[string]$Audio,

	[Parameter(Mandatory)]
	[string]$Output,

	[switch]$Reencode,

	[ValidateSet("auto", "nvenc", "qsv", "amf", "cpu")]
	[string]$Encoder = "auto"
)

function Find-Ffmpeg {
	$bundled = "C:\Users\Administrator\Desktop\ffmpeg\bin\ffmpeg.exe"
	if (Test-Path -LiteralPath $bundled) { return $bundled }

	$command = Get-Command ffmpeg -ErrorAction SilentlyContinue
	if ($command) { return $command.Source }

	throw "未找到 FFmpeg。请安装 FFmpeg，或将 ffmpeg.exe 放到系统 PATH 中。"
}

function Test-H264Encoder {
	param(
		[string]$Ffmpeg,
		[string]$Name
	)

	& $Ffmpeg -hide_banner -loglevel error -f lavfi -i "color=c=black:s=256x256:r=1" -frames:v 1 -c:v $Name -f null "-" 2>$null
	return $LASTEXITCODE -eq 0
}

function Select-Encoder {
	param(
		[string]$Ffmpeg,
		[string]$Preference
	)

	$candidates = switch ($Preference) {
		"nvenc" { @("h264_nvenc", "libx264") }
		"qsv" { @("h264_qsv", "libx264") }
		"amf" { @("h264_amf", "libx264") }
		"cpu" { @("libx264") }
		default { @("h264_nvenc", "h264_qsv", "h264_amf", "libx264") }
	}

	foreach ($candidate in $candidates) {
		if (Test-H264Encoder -Ffmpeg $Ffmpeg -Name $candidate) {
			return $candidate
		}
	}

	throw "没有可用的 H.264 编码器。"
}

$ffmpeg = Find-Ffmpeg
$outputDirectory = Split-Path -Parent $Output
if ($outputDirectory) {
	New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

if (-not $Reencode) {
	Write-Host "极速直通导出：复制原始视频和音频流，不重新编码。"
	$arguments = @("-hide_banner", "-y", "-i", $Video)
	if ($Audio) { $arguments += @("-i", $Audio) }
	$arguments += @("-map", "0:v:0")
	if ($Audio) { $arguments += @("-map", "1:a:0") }
	$arguments += @("-c:v", "copy", "-c:a", "copy", "-shortest", "-movflags", "+faststart", $Output)
	& $ffmpeg @arguments
	exit $LASTEXITCODE
}

$selectedEncoder = Select-Encoder -Ffmpeg $ffmpeg -Preference $Encoder
Write-Host "本机编码器：$selectedEncoder"

$arguments = @("-hide_banner", "-y", "-i", $Video)
if ($Audio) { $arguments += @("-i", $Audio) }
$arguments += @("-map", "0:v:0")
if ($Audio) { $arguments += @("-map", "1:a:0") }
$arguments += @("-c:v", $selectedEncoder, "-b:v", "4M", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", $Output)
& $ffmpeg @arguments
exit $LASTEXITCODE
