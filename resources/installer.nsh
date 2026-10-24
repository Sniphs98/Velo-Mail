; Custom NSIS macros, included by electron-builder (buildResources/installer.nsh).
; Adapted from Remoty.
;
; In-app updates: electron-updater runs this installer with --updated and, as the
; app asks for it, not silently (electron/update/updater.ts), since a silent
; install shows nothing for half a minute. Shown, the assisted installer would ask
; everything a first install asks, so for an update it skips the questions and the
; finish page, leaving only its progress window, and starts the new version itself.
; A normal install from the setup .exe is unchanged.

; "For whom": the same as the installation being updated.
!macro customInstallMode
  !ifndef BUILD_UNINSTALLER
    ${if} ${isUpdated}
      ${if} $hasPerMachineInstallation == "1"
        StrCpy $isForceMachineInstall "1"
      ${else}
        StrCpy $isForceCurrentInstall "1"
      ${endif}
    ${endif}
  !endif
!macroend

; The default finish page (with its "Start Velo Mail" box), except that for an
; update it starts the app right away and closes.
!macro customFinishPage
  Function veloStartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  Function veloFinishPagePre
    ${if} ${isUpdated}
      Call veloStartApp
      Abort
    ${endif}
  FunctionEnd

  !define MUI_PAGE_CUSTOMFUNCTION_PRE veloFinishPagePre
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "veloStartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend
