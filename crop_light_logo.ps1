Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\bruno\.gemini\antigravity-ide\brain\0fac9b8a-5634-48c3-a6ec-653a714c5565\media__1785441649991.png"
$destPath1 = "c:\Users\bruno\OneDrive\Documents\GitHub\nevapro\src\components\logo_light.png"
$destPath2 = "c:\Users\bruno\OneDrive\Documents\GitHub\nevapro\public\logo_light.png"

if (-not (Test-Path $srcPath)) {
    Write-Output "Source file not found: $srcPath"
    exit 1
}

$bmp = New-Object System.Drawing.Bitmap($srcPath)
Write-Output "Original size: $($bmp.Width) x $($bmp.Height)"

$minX = $bmp.Width
$maxX = 0
$minY = $bmp.Height
$maxY = 0

for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt [int]($bmp.Width * 0.68); $x++) {
        $pixel = $bmp.GetPixel($x, $y)
        if ($pixel.A -gt 20 -and ($pixel.R -lt 250 -or $pixel.G -lt 250 -or $pixel.B -lt 250)) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

Write-Output "Cropped bounds: minX=$minX, maxX=$maxX, minY=$minY, maxY=$maxY"

if ($maxX -gt $minX -and $maxY -gt $minY) {
    $w = $maxX - $minX + 1
    $h = $maxY - $minY + 1
    $pad = 12
    
    $cropped = New-Object System.Drawing.Bitmap($w + $pad * 2, $h + $pad * 2)
    
    for ($y = 0; $y -lt $h; $y++) {
        for ($x = 0; $x -lt $w; $x++) {
            $pixel = $bmp.GetPixel($minX + $x, $minY + $y)
            if ($pixel.R -gt 242 -and $pixel.G -gt 242 -and $pixel.B -gt 242) {
                $cropped.SetPixel($x + $pad, $y + $pad, [System.Drawing.Color]::Transparent)
            } else {
                $cropped.SetPixel($x + $pad, $y + $pad, $pixel)
            }
        }
    }
    
    $cropped.Save($destPath1, [System.Drawing.Imaging.ImageFormat]::Png)
    $cropped.Save($destPath2, [System.Drawing.Imaging.ImageFormat]::Png)
    $cropped.Dispose()
    Write-Output "Successfully saved logo_light.png to src/components/ and public/!"
} else {
    Write-Output "No content found in left region."
}

$bmp.Dispose()
