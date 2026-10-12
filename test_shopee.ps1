try {
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    
    $headers = @{
        'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        'Accept' = 'application/json'
        'Accept-Language' = 'en-US,en;q=0.9'
        'Referer' = 'https://shopee.ph/Playstation-5-Slim-(E-Chasis)-Solo-pack-i.1638377258.43526966216'
        'x-api-source' = 'pc'
        'x-shopee-language' = 'en'
        'x-requested-with' = 'XMLHttpRequest'
    }
    
    # Try v2 API
    $url = 'https://shopee.ph/api/v2/item/get?itemid=43526966216&shopid=1638377258'
    $r = Invoke-WebRequest -Uri $url -Headers $headers -WebSession $session -UseBasicParsing
    Write-Host "v2 API Status: $($r.StatusCode)"
    $r.Content | ConvertFrom-Json | ConvertTo-Json -Depth 3
} catch {
    Write-Host "v2 Error: $($_.Exception.Message)"
    
    # Try alternative
    try {
        $url2 = 'https://shopee.ph/api/v4/pdp/get_pc?item_id=43526966216&shop_id=1638377258'
        $r2 = Invoke-WebRequest -Uri $url2 -Headers $headers -UseBasicParsing
        Write-Host "v4 pdp Status: $($r2.StatusCode)"
    } catch {
        Write-Host "v4 pdp Error: $($_.Exception.Message)"
    }
}
