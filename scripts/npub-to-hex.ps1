param(
  [string]$Npub
)

$Charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"
$CharsetRev = @{}
for ($i = 0; $i -lt $Charset.Length; $i++) {
  $CharsetRev[$Charset[$i]] = $i
}

function Bech32Polymod([int[]]$values) {
  $gen = @(0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3)
  $chk = 1
  foreach ($v in $values) {
    $top = $chk -shr 25
    $chk = (($chk -band 0x1ffffff) -shl 5) -bxor $v
    for ($i = 0; $i -lt 5; $i++) {
      if ((($top -shr $i) -band 1) -ne 0) {
        $chk = $chk -bxor $gen[$i]
      }
    }
  }
  return $chk -band 0xffffffff
}

function Bech32HrpExpand([string]$hrp) {
  $res = @()
  for ($i = 0; $i -lt $hrp.Length; $i++) {
    $res += ([int][char]$hrp[$i] -shr 5)
  }
  $res += 0
  for ($i = 0; $i -lt $hrp.Length; $i++) {
    $res += ([int][char]$hrp[$i] -band 31)
  }
  return ,$res
}

function Bech32VerifyChecksum([string]$hrp, [int[]]$data) {
  $polymod = Bech32Polymod ((Bech32HrpExpand $hrp) + $data)
  return ($polymod -eq 1) -or ($polymod -eq 0x2bc830a3)
}

function Bech32Decode([string]$input) {
  $str = $input.ToLower()
  $pos = $str.LastIndexOf("1")
  if ($pos -lt 1 -or ($pos + 7) -gt $str.Length) { return $null }
  $hrp = $str.Substring(0, $pos)
  $data = @()
  for ($i = $pos + 1; $i -lt $str.Length; $i++) {
    $c = $str[$i]
    if (-not $CharsetRev.ContainsKey($c)) { return $null }
    $data += $CharsetRev[$c]
  }
  if (-not (Bech32VerifyChecksum $hrp $data)) { return $null }
  if ($data.Length -le 6) { return $null }
  return @{ hrp = $hrp; data = $data[0..($data.Length - 7)] }
}

function ConvertBits([int[]]$data, [int]$from, [int]$to, [bool]$pad) {
  $acc = 0
  $bits = 0
  $ret = @()
  $maxv = (1 -shl $to) - 1
  foreach ($value in $data) {
    if ($value -lt 0 -or ($value -shr $from) -ne 0) { return $null }
    $acc = (($acc -shl $from) -bor $value)
    $bits += $from
    while ($bits -ge $to) {
      $bits -= $to
      $ret += (($acc -shr $bits) -band $maxv)
    }
  }
  if ($pad) {
    if ($bits -gt 0) { $ret += (($acc -shl ($to - $bits)) -band $maxv) }
  } else {
    if ($bits -ge $from) { return $null }
    if (((($acc -shl ($to - $bits)) -band $maxv)) -ne 0) { return $null }
  }
  return ,$ret
}

if (-not $Npub) {
  Write-Output "用法: powershell -ExecutionPolicy Bypass -File scripts/npub-to-hex.ps1 npub1..."
  exit 1
}

$cleaned = if ($Npub.StartsWith("nostr:")) { $Npub.Substring(6) } else { $Npub }
$decoded = Bech32Decode $cleaned
if (-not $decoded) {
  Write-Output "无效的 bech32 编码"
  exit 1
}
if ($decoded.hrp -ne "npub") {
  Write-Output ("无效的人类可读前缀: {0}" -f $decoded.hrp)
  exit 1
}

$bytes = ConvertBits $decoded.data 5 8 $false
if (-not $bytes -or $bytes.Length -ne 32) {
  Write-Output "解析失败或长度不正确"
  exit 1
}

$hex = ([System.BitConverter]::ToString([byte[]]$bytes)).Replace("-", "").ToLower()
Write-Output $hex
