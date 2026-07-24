/**
 * 데브 ↔ 운영 모드 전환
 *
 * 데브 심링크(com.cidermics.videoplus)와 운영 설치본(videoPlus)은
 * 같은 Extension Id를 사용하므로 둘 중 하나만 있어야 한다.
 *
 * 사용법:
 *   node scripts/mode.js dev      데브 모드 (운영 설치본 비활성화 + 심링크 생성)
 *   node scripts/mode.js release  운영 모드 (심링크 제거 + 운영 설치본 복원)
 *   node scripts/mode.js status   현재 상태 확인
 */
const fs = require("fs")
const path = require("path")
const os = require("os")

const extensionId = "com.cidermics.videoplus"
const releaseName = "videoPlus"
const projectDir = path.resolve(__dirname, "..")
const cepExtensionsDir = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Adobe",
  "CEP",
  "extensions"
)

const linkPath = path.join(cepExtensionsDir, extensionId)
const releasePath = path.join(cepExtensionsDir, releaseName)
const disabledPath = path.join(cepExtensionsDir, releaseName + ".release-disabled")

// 심링크는 대상이 없어도 존재할 수 있으므로 lstat으로 확인
function exists(p) {
  try {
    fs.lstatSync(p)
    return true
  } catch {
    return false
  }
}

function setDev() {
  if (exists(releasePath)) {
    if (exists(disabledPath)) fs.rmSync(disabledPath, { recursive: true })
    fs.renameSync(releasePath, disabledPath)
    console.log("운영 설치본 비활성화:", releaseName, "→", path.basename(disabledPath))
  }
  if (exists(linkPath)) fs.unlinkSync(linkPath)
  fs.symlinkSync(projectDir, linkPath, "dir")
  console.log("✅ 데브 모드")
  console.log("   ", linkPath, "→", projectDir)
}

function setRelease() {
  if (exists(linkPath)) {
    fs.unlinkSync(linkPath)
    console.log("데브 심링크 제거:", linkPath)
  }
  if (!exists(releasePath) && exists(disabledPath)) {
    fs.renameSync(disabledPath, releasePath)
    console.log("운영 설치본 복원:", path.basename(disabledPath), "→", releaseName)
  }
  if (exists(releasePath)) {
    console.log("✅ 운영 모드")
    console.log("   ", releasePath)
  } else {
    console.log("⚠️  운영 설치본이 없습니다. 설치 파일(ZXP)로 다시 설치하세요.")
  }
}

function status() {
  const dev = exists(linkPath)
  const release = exists(releasePath)
  console.log("데브 심링크 :", dev ? linkPath : "없음")
  console.log("운영 설치본 :", release ? releasePath : "없음")
  if (exists(disabledPath)) console.log("비활성화됨  :", disabledPath)
  if (dev && release) {
    console.log("⚠️  둘 다 존재 — Extension Id가 충돌합니다. dev 또는 release로 정리하세요.")
  } else {
    console.log("현재 모드   :", dev ? "데브" : release ? "운영" : "없음 (둘 다 미설치)")
  }
}

const command = process.argv[2]
if (command === "dev") setDev()
else if (command === "release") setRelease()
else if (command === "status") status()
else {
  console.log("사용법: node scripts/mode.js <dev|release|status>")
  process.exit(1)
}

if (command === "dev" || command === "release") {
  console.log("")
  console.log("⚠️  PPro 재시작 필요")
}
