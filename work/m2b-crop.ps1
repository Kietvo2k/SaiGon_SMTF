param([string]$In,[string]$Out,[int]$X,[int]$Y,[int]$W,[int]$H,[int]$S=3)
Add-Type -AssemblyName System.Drawing
$src=[System.Drawing.Image]::FromFile((Resolve-Path $In))
$S=[Math]::Max(1,$S)
$dst=New-Object System.Drawing.Bitmap ([int]($W*$S)),([int]($H*$S))
$g=[System.Drawing.Graphics]::FromImage($dst)
$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.DrawImage($src,(New-Object System.Drawing.Rectangle 0,0,([int]($W*$S)),([int]($H*$S))),(New-Object System.Drawing.Rectangle $X,$Y,$W,$H),[System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$dst.Save((Join-Path (Get-Location) $Out),[System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose();$src.Dispose()
"wrote $Out ($($W*$S)x$($H*$S))"
