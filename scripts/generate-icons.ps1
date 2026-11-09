Add-Type -AssemblyName System.Drawing
$srcPath = Join-Path (Get-Location) "public\logo.jpg"
$img = [System.Drawing.Image]::FromFile($srcPath)

function Resize-Img($size, $outRelPath) {
    $outPath = Join-Path (Get-Location) $outRelPath
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::White)
    $g.DrawImage($img, 0, 0, $size, $size)
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created $outPath"
}

Resize-Img 192 "public\icon-192.png"
Resize-Img 512 "public\icon-512.png"
Resize-Img 192 "assets\icon-192.png"
Resize-Img 512 "assets\icon-512.png"
$img.Dispose()
