"""Build a signed APK using a locally installed JDK 21 and Android SDK 36."""
import hashlib
import re
import os
from pathlib import Path
import secrets
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    env = dict(os.environ)
    sdk_value = env.get("ANDROID_HOME") or env.get("ANDROID_SDK_ROOT")
    if not sdk_value:
        raise SystemExit("Set ANDROID_HOME to an Android SDK with platform 36 and build-tools 36.0.0.")
    sdk = Path(sdk_value).resolve()
    if env.get("JAVA_HOME"):
        env["PATH"] = str(Path(env["JAVA_HOME"]) / "bin") + os.pathsep + env["PATH"]
    windows = sys.platform == "win32"

    def run(args):
        subprocess.run([str(arg) for arg in args], cwd=ROOT, env=env, check=True)

    run(["node", "scripts/prepare.mjs"])
    run(["node", "node_modules/@capacitor/cli/bin/capacitor", "sync", "android"])
    gradle = ROOT / "android" / ("gradlew.bat" if windows else "gradlew")
    run([gradle, "-p", "android", "assembleRelease", "--no-daemon", "--console=plain"])
    key_value = env.get("UCAS_KEYSTORE_FILE")
    password_file = env.get("UCAS_KEYSTORE_PASSWORD_FILE")
    if password_file:
        env["UCAS_KEYSTORE_PASSWORD"] = Path(password_file).read_text().strip()
    alias = env.get("UCAS_KEY_ALIAS", "planner")
    if key_value:
        key = Path(key_value).resolve()
        if not key.is_file() or not env.get("UCAS_KEYSTORE_PASSWORD"):
            raise SystemExit("Existing signing requires UCAS_KEYSTORE_FILE and UCAS_KEYSTORE_PASSWORD (or UCAS_KEYSTORE_PASSWORD_FILE).")
    else:
        signing = ROOT / ".signing"
        signing.mkdir(exist_ok=True, mode=0o700)
        password = signing / "password"
        if not password.exists():
            password.write_text(secrets.token_urlsafe(32))
            password.chmod(0o600)
        env["UCAS_KEYSTORE_PASSWORD"] = password.read_text().strip()
        key = signing / "planner.jks"
        if not key.exists():
            run(["keytool", "-genkeypair", "-keystore", key, "-storepass:env", "UCAS_KEYSTORE_PASSWORD", "-keypass:env", "UCAS_KEYSTORE_PASSWORD", "-alias", alias, "-keyalg", "RSA", "-keysize", "2048", "-validity", "10000", "-dname", "CN=Personal Course Planner"])
            key.chmod(0o600)
    output = ROOT / "dist"
    output.mkdir(exist_ok=True)
    tools = sdk / "build-tools/36.0.0"
    zipalign = tools / ("zipalign.exe" if windows else "zipalign")
    apksigner = tools / ("apksigner.bat" if windows else "apksigner")
    unsigned = ROOT / "android/app/build/outputs/apk/release/app-release-unsigned.apk"
    aligned = output / "aligned.apk"
    version = re.search(r'\bversionName\s+"([^"]+)"', (ROOT / "android/app/build.gradle").read_text()).group(1)
    apk = output / f"ucas-timetable-android-v{version}.apk"
    run([zipalign, "-f", "-p", "4", unsigned, aligned])
    run([apksigner, "sign", "--ks", key, "--ks-key-alias", alias, "--ks-pass", "env:UCAS_KEYSTORE_PASSWORD", "--key-pass", "env:UCAS_KEYSTORE_PASSWORD", "--out", apk, aligned])
    run([apksigner, "verify", "--verbose", apk])
    digest = hashlib.sha256(apk.read_bytes()).hexdigest()
    (output / "SHA256SUMS.txt").write_text(f"{digest}  {apk.name}\n")
    aligned.unlink()
    print(f"Release APK: {apk}", flush=True)


if __name__ == "__main__":
    main()
