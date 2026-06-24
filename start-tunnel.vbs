Dim shell, cmd, outFile
Set shell = CreateObject("WScript.Shell")
outFile = shell.ExpandEnvironmentStrings("%TEMP%") & "\cf_debug.txt"
cmd = Chr(34) & "C:\Program Files (x86)\cloudflared\cloudflared.exe" & Chr(34)
shell.Run "cmd.exe /c echo STARTED > """ & outFile & """ && " & cmd & " tunnel --url http://localhost:3000 >> """ & outFile & """ 2>&1", 0, False
