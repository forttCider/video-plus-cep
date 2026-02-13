/**
 * CEP 확장을 PPro 확장 폴더에 심볼릭 링크
 * macOS: ~/Library/Application Support/Adobe/CEP/extensions/
 */
const fs = require("fs")
const path = require("path")
const os = require("os")

const extensionId = "com.cidermics.videoplus"
const extensionDir = path.resolve(__dirname, "..")
const cepExtensionsDir = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Adobe",
  "CEP",
  "extensions"
)

// CEP extensions 폴더 생성
if (!fs.existsSync(cepExtensionsDir)) {
  fs.mkdirSync(cepExtensionsDir, { recursive: true })
  console.log("생성:", cepExtensionsDir)
}

const linkPath = path.join(cepExtensionsDir, extensionId)

// 기존 링크 제거
if (fs.existsSync(linkPath)) {
  fs.unlinkSync(linkPath)
  console.log("기존 링크 제거:", linkPath)
}

// 심볼릭 링크 생성
fs.symlinkSync(extensionDir, linkPath, "dir")
console.log("✅ 링크 완료!")
console.log("   ", extensionDir)
console.log("   →", linkPath)
console.log("")
console.log("⚠️  디버그 모드를 활성화하려면:")
console.log("   defaults write com.adobe.CSXS.12 PlayerDebugMode 1")
console.log("   (PPro 재시작 필요)")
