; Fecha o Radar CS (que fica na bandeja) antes de instalar, sem pedir para a pessoa fechar.
!macro customCheckAppRunning
  nsExec::Exec `taskkill /F /T /IM "Radar CS.exe"`
  Sleep 1500
!macroend
