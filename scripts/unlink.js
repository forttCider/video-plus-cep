const fs = require("fs")
const path = require("path")
const os = require("os")

const extensionId = "com.cidermics.videoplus"
const linkPath = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Adobe",
  "CEP",
  "extensions",
  extensionId
)

if (fs.existsSync(linkPath)) {
  fs.unlinkSync(linkPath)
  console.log("✅ 링크 제거:", linkPath)
} else {
  console.log("링크가 없습니다:", linkPath)
}
