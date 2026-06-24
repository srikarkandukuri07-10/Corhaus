Dim shell, logFile
Set shell = CreateObject("WScript.Shell")
logFile = shell.ExpandEnvironmentStrings("%TEMP%") & "\cf_test.txt"
shell.Run "cmd.exe /c echo STARTED > """ & logFile & """", 0, False
WScript.Sleep 3000
