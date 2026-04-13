/**
 * Node.js https 모듈을 사용한 GET 요청
 * Chromium 소켓 풀과 독립적으로 동작하여 CEP 패널 종료 시 연결 잔존 문제 없음
 */
const https = window.require("https")

let activeRequest = null

export function nodeGet(url) {
  return new Promise((resolve, reject) => {
    activeRequest = https.get(url, (res) => {
      let data = ""
      res.on("data", (chunk) => { data += chunk })
      res.on("end", () => {
        activeRequest = null
        try {
          resolve(JSON.parse(data))
        } catch {
          resolve(null)
        }
      })
    })
    activeRequest.on("error", (err) => {
      activeRequest = null
      reject(err)
    })
  })
}

export function abortNodeRequest() {
  if (activeRequest) {
    activeRequest.destroy()
    activeRequest = null
  }
}
