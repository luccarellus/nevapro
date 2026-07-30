Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\bruno\.gemini\antigravity-ide\brain\0fac9b8a-5634-48c3-a6ec-653a714c5565\media__1785441649991.png"
$destPng1 = "c:\Users\bruno\OneDrive\Documents\GitHub\nevapro\src\components\logo_light.png"
$destPng2 = "c:\Users\bruno\OneDrive\Documents\GitHub\nevapro\public\logo_light.png"
$destTs = "c:\Users\bruno\OneDrive\Documents\GitHub\nevapro\src\components\logoLightData.ts"

if (Test-Path $srcPath) {
    $bmp = New-Object System.Drawing.Bitmap($srcPath)
    Write-Output "Original size: $($bmp.Width) x $($bmp.Height)"

    $minX = $bmp.Width
    $maxX = 0
    $minY = $bmp.Height
    $maxY = 0

    for ($y = 0; $y -lt $bmp.Height; $y++) {
        for ($x = 0; $x -lt [int]($bmp.Width * 0.65); $x++) {
            $pixel = $bmp.GetPixel($x, $y)
            if ($pixel.A -gt 20 -and ($pixel.R -lt 248 -or $pixel.G -lt 248 -or $pixel.B -lt 248)) {
                if ($x -lt $minX) { $minX = $x }
                if ($x -gt $maxX) { $maxX = $x }
                if ($y -lt $minY) { $minY = $y }
                if ($y -gt $maxY) { $maxY = $y }
            }
        }
    }

    if ($maxX -gt $minX -and $maxY -gt $minY) {
        $w = $maxX - $minX + 1
        $h = $maxY - $minY + 1
        $pad = 8
        
        $cropped = New-Object System.Drawing.Bitmap($w + $pad * 2, $h + $pad * 2)
        $g = [System.Drawing.Graphics]::FromImage($cropped)
        $g.Clear([System.Drawing.Color]::Transparent)
        
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
        
        $cropped.Save($destPng1, [System.Drawing.Imaging.ImageFormat]::Png)
        $cropped.Save($destPng2, [System.Drawing.Imaging.ImageFormat]::Png)
        $g.Dispose()

        $ms = New-Object System.IO.MemoryStream
        $cropped.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $bytes = $ms.ToArray()
        $ms.Dispose()
        $cropped.Dispose()
        
        $base64 = [Convert]::ToBase64String($bytes)
        $tsContent = "export const LOGO_LIGHT_DATA = `"data:image/png;base64,$base64`";`n"
        Set-Content -Path $destTs -Value $tsContent -Encoding UTF8
        Write-Output "Created logoLightData.ts successfully!"
    }
    $bmp.Dispose()
}
