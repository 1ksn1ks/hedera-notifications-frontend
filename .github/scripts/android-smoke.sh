#!/usr/bin/env bash
# Smoke test on the CI emulator: install the APK, open the app, wait, and
# report. Usage: android-smoke.sh <apk> <package> [text the first screen shows]
#
# A crash puts Android's crash lines into a public annotation (job logs need
# a signed-in admin, annotations do not). The slow emulator sometimes shows
# its own dialogs over the app ("System UI isn't responding", the
# notification permission prompt): they are dismissed and the app is brought
# back before the screen is read. Leaves logcat.txt, ui.xml and screen.png.
set -u
APK="$1"
PKG="$2"
EXPECT="${3:-}"

# One annotation per message: GitHub needs % and newlines escaped.
esc() { sed 's/%/%25/g; s/\r//g' "$1" | awk '{printf "%s%%0A", $0}'; }

dump_ui() {
  rm -f ui.xml
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 && adb pull /sdcard/ui.xml ui.xml > /dev/null 2>&1
  [ -f ui.xml ] || : > ui.xml
}

# Tap the centre of the first on-screen element whose text is exactly $1.
tap_text() {
  local b x1 y1 x2 y2
  b=$(grep -o "text=\"$1\"[^>]*bounds=\"\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]\"" ui.xml | head -1 \
    | grep -o '\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]')
  [ -n "$b" ] || return 1
  read -r x1 y1 x2 y2 <<< "$(echo "$b" | tr -c '0-9' ' ')"
  adb shell input tap $(( (x1 + x2) / 2 )) $(( (y1 + y2) / 2 ))
}

bring_back() {
  sleep 2
  adb shell am start -n "$PKG/.MainActivity" > /dev/null 2>&1 || true
  sleep 8
  dump_ui
}

if ! adb install -r "$APK" > install.txt 2>&1; then
  echo "::error title=APK did not install::$(esc install.txt)"
  exit 1
fi

adb logcat -c
adb shell am start -W -n "$PKG/.MainActivity" > start.txt 2>&1 || true
sleep 30
dump_ui

for _ in 1 2 3; do
  if grep -q "isn't responding" ui.xml; then
    tap_text "Wait" || adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null 2>&1
    bring_back
  elif grep -q 'package="com\.\(google\.\)\?android\.permissioncontroller"' ui.xml; then
    tap_text "Allow" || tap_text "ALLOW" || break
    bring_back
  else
    break
  fi
done

adb logcat -d -v brief > logcat.txt 2>&1
adb exec-out screencap -p > screen.png 2>/dev/null || true
PID=$(adb shell pidof "$PKG" 2>/dev/null | tr -d '\r')

grep -E "AndroidRuntime|ReactNativeJS|ReactNative|Fatal signal|F/DEBUG|F/libc|UnsatisfiedLinkError|ClassNotFoundException|SoLoader|TurboModuleRegistry|Invariant Violation|hermes" logcat.txt \
  | head -80 > why.txt

if [ -z "$PID" ]; then
  [ -s why.txt ] || tail -60 logcat.txt > why.txt
  echo "::error title=App closed on launch::$(esc why.txt)"
  exit 1
fi

TEXT=$(grep -o 'text="[^"]\+"' ui.xml 2>/dev/null | sed 's/^text="//; s/"$//' | head -25 | paste -sd'|' -)
echo "::notice title=App is running (pid ${PID})::Screen text: ${TEXT:-none found}"

if [ -n "$EXPECT" ] && ! grep -qF "text=\"$EXPECT\"" ui.xml; then
  echo "::warning title=First screen not confirmed::The app is running, but \"$EXPECT\" was not on screen. Screen text: ${TEXT:-none found}"
fi

grep -E "^[EW]/ReactNativeJS" logcat.txt | head -25 > js.txt
if [ -s js.txt ]; then
  echo "::warning title=JS errors or warnings at startup::$(esc js.txt)"
fi
exit 0
