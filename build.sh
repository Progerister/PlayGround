#!/usr/bin/env bash
# Builds the signed Android package without Gradle/AGP:
#   aapt2 (compile + link) -> javac -> d8 -> zipalign -> apksigner
set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="${APP_NAME:-aion2gs}"
VERSION_NAME="${VERSION_NAME:-1.0.0}"
VERSION_CODE="${VERSION_CODE:-1}"
GUIDE_URL="${GUIDE_URL:-}"      # remote guide.json (raw.githack / Pages), empty = bundled copy only
APK_URL="${APK_URL:-}"          # public download link shown in the web build
SDK="${ANDROID_HOME:?ANDROID_HOME is not set}"
BT="$SDK/build-tools/35.0.0"
AJAR="$SDK/platforms/android-35/android.jar"
OUT="build"
DIST="dist"

echo "== prepare =="
rm -rf "$OUT/classes" "$OUT/dex" "$OUT/assets" "$OUT/java" "$OUT/res.zip" "$OUT/base.apk" "$OUT/unsigned.apk" "$OUT/aligned.apk"
mkdir -p "$OUT" "$DIST"

# stage assets so the repo copy keeps its placeholders
cp -r app/src/main/assets "$OUT/assets"
python3 - "$OUT/assets/js/config.js" <<PY
import sys, datetime
path = sys.argv[1]
src = open(path, encoding="utf-8").read()
src = src.replace("__BUILD_AT__", datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"))
src = src.replace("__GUIDE_URL__", """$GUIDE_URL""")
src = src.replace("__APK_URL__", """$APK_URL""")
open(path, "w", encoding="utf-8").write(src)
PY

mkdir -p "$OUT/java/com/playground/aion2gs"
sed "s/__VERSION_NAME__/$VERSION_NAME/" \
  app/src/main/java/com/playground/aion2gs/MainActivity.java \
  > "$OUT/java/com/playground/aion2gs/MainActivity.java"

MANIFEST="app/src/main/AndroidManifest.xml"
if [ "${DEBUG:-0}" = "1" ]; then
  python3 - "$MANIFEST" "$OUT/AndroidManifest.xml" <<'PYMAN'
import re, sys
src = open(sys.argv[1], encoding="utf-8").read()
src = re.sub(r"(<application\b)", r'\1 android:debuggable="true"', src, count=1)
open(sys.argv[2], "w", encoding="utf-8").write(src)
PYMAN
  MANIFEST="$OUT/AndroidManifest.xml"
fi

echo "== resources =="
"$BT/aapt2" compile --dir app/src/main/res -o "$OUT/res.zip"
"$BT/aapt2" link \
  -o "$OUT/base.apk" \
  -I "$AJAR" \
  --manifest "$MANIFEST" \
  -R "$OUT/res.zip" \
  --min-sdk-version 26 \
  --target-sdk-version 34 \
  --version-code "$VERSION_CODE" \
  --version-name "$VERSION_NAME" \
  -A "$OUT/assets" \
  --auto-add-overlay

echo "== javac =="
find "$OUT/java" -name '*.java' > "$OUT/sources.txt"
javac -source 8 -target 8 -nowarn -bootclasspath "$AJAR" -d "$OUT/classes" @"$OUT/sources.txt"

echo "== d8 =="
mkdir -p "$OUT/dex"
"$BT/d8" --release --lib "$AJAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')

echo "== package =="
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT" && zip -q -j unsigned.apk dex/classes.dex)

echo "== align + sign =="
KEYSTORE="$OUT/debug.keystore"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -v -keystore "$KEYSTORE" -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10950 \
    -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
fi
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias androiddebugkey --out "$DIST/$APP_NAME-$VERSION_NAME.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify --print-certs "$DIST/$APP_NAME-$VERSION_NAME.apk" | head -6

SIZE=$(stat -c%s "$DIST/$APP_NAME-$VERSION_NAME.apk")
echo "== done: $DIST/$APP_NAME-$VERSION_NAME.apk ($SIZE bytes) =="
