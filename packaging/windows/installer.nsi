; MediBill NSIS Installer Script
; Requires NSIS 3.x — download from https://nsis.sourceforge.io/
; Build:  makensis installer.nsi

!include "MUI2.nsh"
!include "FileFunc.nsh"

; ─── General ─────────────────────────────────────────────────────────────────
Name "MediBill"
OutFile "..\..\MediBill-Setup.exe"
InstallDir "$PROGRAMFILES64\MediBill"
InstallDirRegKey HKLM "Software\MediBill" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma

; ─── Version Info ────────────────────────────────────────────────────────────
VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName" "MediBill"
VIAddVersionKey "CompanyName" "MediBill"
VIAddVersionKey "LegalCopyright" "MediBill"
VIAddVersionKey "FileDescription" "MediBill Pharmacy Billing Installer"
VIAddVersionKey "FileVersion" "1.0.0"

; ─── Modern UI ───────────────────────────────────────────────────────────────
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\modern-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\modern-uninstall.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Wizard\win.bmp"
!define MUI_ABORTWARNING

; ─── Pages ───────────────────────────────────────────────────────────────────
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "LICENSE.txt"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\start.bat"
!define MUI_FINISHPAGE_RUN_TEXT "Launch MediBill"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; ─── Languages ───────────────────────────────────────────────────────────────
!insertmacro MUI_LANGUAGE "English"

; ─── Helper Functions ─────────────────────────────────────────────────────────
Function .onInit
  ; Detect if 64-bit Windows
  ${If} ${RunningX64}
    SetRegView 64
  ${Else}
    MessageBox MB_OK|MB_ICONSTOP "MediBill requires 64-bit Windows."
    Abort
  ${EndIf}
FunctionEnd

; ─── Installer Sections ───────────────────────────────────────────────────────
Section "MediBill (required)" SecMain
  SetOutPath "$INSTDIR"

  ; ── Copy all distribution files ──
  ; Assumes dist layout:
  ;   dist/
  ;     web/         ← Vite SPA build
  ;     server/      ← compiled Node.js server
  ;     start.bat
  ;     medibill.db

  File /r "..\..\dist\web"
  File /r "..\..\dist\server"
  File "..\..\dist\start.bat"
  File "..\..\dist\stop.bat"

  ; Create data directory at AppData
  CreateDirectory "$APPDATA\MediBill\data"
  CreateDirectory "$APPDATA\MediBill\backups\daily"
  CreateDirectory "$APPDATA\MediBill\backups\weekly"

  ; ── Write uninstaller ──
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; ── Registry keys ──
  WriteRegStr HKLM "Software\MediBill" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MediBill" "DisplayName" "MediBill"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MediBill" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MediBill" "DisplayIcon" "$INSTDIR\start.bat"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MediBill" "Publisher" "MediBill"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MediBill" "DisplayVersion" "1.0.0"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MediBill" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MediBill" "NoRepair" 1

  ; ── Installed size ──
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MediBill" "EstimatedSize" "$0"

  ; ── Shortcuts ──
  CreateDirectory "$SMPROGRAMS\MediBill"
  CreateShortCut "$SMPROGRAMS\MediBill\MediBill.lnk" "$INSTDIR\start.bat"
  CreateShortCut "$SMPROGRAMS\MediBill\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\MediBill.lnk" "$INSTDIR\start.bat"
SectionEnd

; ─── Optional: Open Firewall Port ─────────────────────────────────────────────
Section "Open Firewall Port (Recommended)" SecFirewall
  !insertmacro SectionInInstalled
  ExecWait 'netsh advfirewall firewall add rule name="MediBill Server" dir=in action=allow program="$INSTDIR\server\index.js" enable=yes remoteip=local subnet'
SectionEnd

; ─── Uninstaller Section ───────────────────────────────────────────────────────
Section "Uninstall"
  ; Try to stop running server
  ExecWait 'taskkill /F /IM node.exe'

  ; Remove all installed files
  RMDir /r "$INSTDIR"

  ; Remove Start Menu folder
  RMDir /r "$SMPROGRAMS\MediBill"

  ; Remove Desktop shortcut
  Delete "$DESKTOP\MediBill.lnk"

  ; Remove registry
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\MediBill"
  DeleteRegKey HKLM "Software\MediBill"

  ; Ask about user data
  MessageBox MB_YESNO|MB_ICONQUESTION "Remove all MediBill data (database, backups, settings)?" IDNO +2
    RMDir /r "$APPDATA\MediBill"
SectionEnd
