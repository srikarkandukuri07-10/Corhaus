$logFile = "$env:TEMP\cf_tunnel.log"
$proc = Start-Process -FilePath "C:\Program Files (x86)\cloudflared\cloudflared.exe" -ArgumentList "tunnel --url http://localhost:3000" -WindowStyle Hidden -PassThru -RedirectStandardOutput $logFile -RedirectStandardError "$env:TEMP\cf_tunnel_err.log"
$proc.Id | Out-File "$env:TEMP\cf_pid.txt"
