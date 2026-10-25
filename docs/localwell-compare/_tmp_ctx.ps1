param([string]$File,[string]$Kws,[int]$Ctx=260,[int]$MaxHits=2)
$t=[System.IO.File]::ReadAllText($File)
if(-not $Kws){ Write-Output "provide keywords"; exit }
foreach($kw in $Kws.Split("|")){
  $idx=0;$hits=@()
  while(($idx=$t.IndexOf($kw,$idx)) -ge 0 -and $hits.Count -lt $MaxHits){
    $s=[Math]::Max(0,$idx-$Ctx); $len=[Math]::Min($Ctx*2,$t.Length-$s)
    $hits += ($t.Substring($s,$len) -replace "`r|`n"," "); $idx+=$kw.Length
  }
  if($hits.Count){ Write-Output ("### " + $kw); $hits | ForEach-Object { Write-Output ("  ..." + $_) } }
}
