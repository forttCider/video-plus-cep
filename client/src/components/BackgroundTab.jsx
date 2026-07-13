import React, { useState, useEffect } from "react"
import {
  Loader2,
  Sparkles,
  Download,
  Check,
  Plus,
  Maximize2,
  ImageOff,
  ImagePlus,
  ChevronRight,
  RefreshCw,
  Wand2,
  X,
} from "lucide-react"
import { Button } from "./ui/button"
import ImageLightbox from "./ImageLightbox"
import ElementRow from "./ElementRow"
import {
  generateBackground,
  generateElementImage,
  composeBackground,
  editBackground,
  removeBackground,
  ensureRemoveBg,
  loadConfig,
  fileToUrl,
  pickFolder,
  downloadImageTo,
} from "../js/personimage-bridge"
import { extractBackgroundSubjects, generateElementPrompt } from "../js/title-bridge"
import { useDevSettings } from "../js/devSettings"
import {
  buildBgPrompt,
  buildEditPrompt,
  COLOR_DOT,
  COLOR_DESC,
  N_OPTIONS,
  IMP_LABELS,
} from "../js/bgPrompt"

let _uid = 0
const uid = () => ++_uid

const EMPTY = {
  elements: [],
  extractStatus: "idle", // idle | extracting | done | error
  extractError: null,
  finalPrompt: "",
  n: 1,
  genStatus: "idle", // idle | generating | done | error
  genError: null,
  results: [], // {path, url, selected, downloading, downloaded}
}

// 동시 실행 제한 풀 (이미지 생성 레이트리밋 대비)
function runPool(items, limit, fn) {
  let i = 0
  const next = () => {
    if (i >= items.length) return
    const cur = items[i++]
    Promise.resolve(fn(cur)).finally(next)
  }
  for (let k = 0; k < Math.min(limit, items.length); k++) next()
}

// 로컬 파일 존재 확인 (캐시된 배경제거 파일 유효성)
function fileExists(p) {
  try {
    return !!p && require("fs").existsSync(p)
  } catch (e) {
    return false
  }
}

/**
 * 배경 생성 파이프라인 (배치 조립라인).
 * parts([{part,title,color,text}]) 를 받아 ① 요소 검토(전체 추출·편집) → ② 결과 갤러리(전체 생성·선택 저장).
 */
export default function BackgroundTab({ worker, parts, channelId }) {
  const hasParts = parts && parts.length > 0
  const { previewMode, simulateEmpty } = useDevSettings()
  const rbgSize = previewMode ? "preview" : "auto"

  const [store, setStore] = useState({}) // { [partNo]: entry }
  const [stage, setStage] = useState("review") // review | gallery
  const [apiKey, setApiKey] = useState("")
  const [rmbgKey, setRmbgKey] = useState("") // remove.bg (배경제거)
  const [zoom, setZoom] = useState(null) // {images, index}
  const [dlAll, setDlAll] = useState(false)
  const [editTarget, setEditTarget] = useState(null) // {no, i, path, url}
  const [editText, setEditText] = useState("")
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState(null)

  useEffect(() => {
    const cfg = loadConfig()
    if (cfg.imageGenApiKey) setApiKey(cfg.imageGenApiKey)
    if (cfg.removeBgApiKey) setRmbgKey(cfg.removeBgApiKey)
  }, [])

  // 편성이 바뀌면(파트 구성/내용 변경) 파이프라인 초기화
  const partsSig = hasParts ? parts.map((p) => `${p.part}:${p.text.length}`).join("|") : ""
  useEffect(() => {
    setStore({})
    setStage("review")
  }, [partsSig])

  // ── store 헬퍼 ──
  const getPart = (no) => store[no] || EMPTY
  const patchPart = (no, patch) =>
    setStore((s) => ({ ...s, [no]: { ...EMPTY, ...s[no], ...patch } }))
  const patchElement = (no, elId, patch) =>
    setStore((s) => {
      const e = s[no] || EMPTY
      return {
        ...s,
        [no]: { ...e, elements: e.elements.map((x) => (x.id === elId ? { ...x, ...patch } : x)) },
      }
    })
  const patchResult = (no, idx, patch) =>
    setStore((s) => {
      const e = s[no] || EMPTY
      return {
        ...s,
        [no]: { ...e, results: e.results.map((r, i) => (i === idx ? { ...r, ...patch } : r)) },
      }
    })

  // ── ① 배치 추출 ──
  const extractOne = (no, text) => {
    patchPart(no, { extractStatus: "extracting", extractError: null })
    const part = parts.find((p) => p.part === no)
    const mood = part && part.color ? COLOR_DESC[part.color] : null
    return extractBackgroundSubjects(text, { mood, channelId })
      .then((r) => {
        if (r.success)
          patchPart(no, {
            elements: r.subjects.map((s) => ({ ...s, id: uid() })),
            extractStatus: "done",
          })
        else patchPart(no, { extractStatus: "error", extractError: r.error || "추출 실패" })
      })
      .catch((e) => patchPart(no, { extractStatus: "error", extractError: String(e) }))
  }
  const extractAll = () => runPool(parts, 4, (p) => extractOne(p.part, p.text))

  const regenPrompt = (no, elId) => {
    const el = getPart(no).elements.find((e) => e.id === elId)
    if (!el || !(el.name || "").trim()) return
    patchElement(no, elId, { promptLoading: true })
    generateElementPrompt(el.name)
      .then((r) => patchElement(no, elId, { promptLoading: false, ...(r.success ? { prompt: r.prompt } : {}) }))
      .catch(() => patchElement(no, elId, { promptLoading: false }))
  }
  const addElement = (no) =>
    setStore((s) => {
      const e = s[no] || EMPTY
      return {
        ...s,
        [no]: {
          ...e,
          elements: [...e.elements, { id: uid(), name: "", category: "", importance: 2, prompt: "" }],
        },
      }
    })
  const removeElement = (no, elId) =>
    setStore((s) => {
      const e = s[no] || EMPTY
      return { ...s, [no]: { ...e, elements: e.elements.filter((x) => x.id !== elId) } }
    })

  // ── 요소 이미지 생성(선택 단계) ──
  const genElementImage = (no, elId) => {
    const el = getPart(no).elements.find((e) => e.id === elId)
    if (!el) return Promise.resolve()
    const prompt = (el.prompt || el.name || "").trim()
    if (!prompt) {
      patchElement(no, elId, { imgStatus: "error", imgError: "프롬프트/이름이 없습니다" })
      return Promise.resolve()
    }
    patchElement(no, elId, { imgStatus: "generating", imgError: null })
    return generateElementImage(prompt, { apiKey, ns: `part${no}` })
      .then((r) => {
        if (r.success && r.results && r.results.length) {
          const p = r.results[0].path
          patchElement(no, elId, {
            imgStatus: "done",
            imgPath: p,
            imgUrl: fileToUrl(p),
            imgSelected: true,
            imgError: null,
            cutPath: null, // 새 이미지 → 이전 배경제거 캐시 무효화
          })
        } else {
          patchElement(no, elId, { imgStatus: "error", imgError: r.error || "생성 실패" })
        }
      })
      .catch((e) => patchElement(no, elId, { imgStatus: "error", imgError: String(e) }))
  }
  const runImageJobs = (jobs) => {
    // 대기열도 시작 전 상태와 구분되게 즉시 'queued' 표시
    jobs.forEach((j) => patchElement(j.no, j.elId, { imgStatus: "queued", imgError: null }))
    runPool(jobs, 3, (j) => genElementImage(j.no, j.elId))
  }
  const genAllElementImages = () => {
    const jobs = []
    parts.forEach((p) =>
      getPart(p.part).elements.forEach((el) => {
        if ((el.prompt || el.name || "").trim() && el.imgStatus !== "generating")
          jobs.push({ no: p.part, elId: el.id })
      }),
    )
    runImageJobs(jobs)
  }
  const genPartElementImages = (no) => {
    const jobs = getPart(no)
      .elements.filter(
        (el) => (el.prompt || el.name || "").trim() && el.imgStatus !== "generating",
      )
      .map((el) => ({ no, elId: el.id }))
    runImageJobs(jobs)
  }
  const toggleElementImage = (no, elId) => {
    const el = getPart(no).elements.find((e) => e.id === elId)
    if (!el || el.imgStatus !== "done") return
    patchElement(no, elId, { imgSelected: !el.imgSelected })
  }

  // ── 요소 이미지 배경제거 다운로드(개별/부별/전체) ──
  const doneEls = (no) =>
    getPart(no).elements.filter((el) => el.imgStatus === "done" && el.imgPath)
  const elCutPath = (no, elId) => {
    const el = getPart(no).elements.find((e) => e.id === elId)
    return el && el.cutPath
  }
  const isElCached = (no, elId) => {
    const c = elCutPath(no, elId)
    return c && fileExists(c)
  }
  // cut=true면 배경제거(removeBackground) 후 저장, false면 원본 그대로 저장. 이미 배경제거된 건 재사용.
  const cutAndSave = (no, elId, path, dir, cut) => {
    patchElement(no, elId, { dlStatus: "cutting", dlError: null })
    const cached = elCutPath(no, elId)
    const hasCache = cached && fileExists(cached)
    let step
    if (hasCache) {
      step = Promise.resolve(cached) // 이미 배경제거된 파일 재사용 (크레딧 X)
    } else if (cut) {
      step = removeBackground(path, { apiKey: rmbgKey, size: rbgSize }).then((r) => {
        if (r.success) {
          patchElement(no, elId, { cutPath: r.path }) // 캐시 저장
          return r.path
        }
        patchElement(no, elId, { dlError: r.error || "배경제거 실패" })
        return path
      })
    } else {
      step = Promise.resolve(path) // 원본 그대로
    }
    return step
      .then((savePath) => {
        const saved = downloadImageTo(savePath, dir)
        if (saved.success) {
          patchElement(no, elId, { dlStatus: "done" })
          setTimeout(() => patchElement(no, elId, { dlStatus: null }), 8000)
        } else {
          patchElement(no, elId, { dlStatus: "error", dlError: saved.error || "저장 실패" })
        }
      })
      .catch((e) => patchElement(no, elId, { dlStatus: "error", dlError: String(e) }))
  }
  const runDownloadJobs = async (jobs) => {
    if (!jobs.length) return
    // 이미 배경제거된(캐시) 건 그냥 다운로드. 새로 배경제거가 필요한 게 있을 때만 잔여 확인.
    const cachedCount = jobs.filter((j) => isElCached(j.no, j.elId)).length
    const needsCut = cachedCount < jobs.length
    let cut = true
    if (!rmbgKey) {
      cut = false
    } else if (needsCut) {
      const gate = await ensureRemoveBg({ apiKey: rmbgKey, forceEmpty: simulateEmpty, cachedCount })
      if (gate.cancelled) return
      cut = !!gate.cut
    }
    const dir = pickFolder()
    if (!dir) return
    jobs.forEach((j) => patchElement(j.no, j.elId, { dlStatus: "queued", dlError: null }))
    runPool(jobs, 2, (j) => cutAndSave(j.no, j.elId, j.path, dir, cut))
  }
  const downloadOneElement = (no, elId, path) => runDownloadJobs([{ no, elId, path }])
  const downloadPartElements = (no) =>
    runDownloadJobs(doneEls(no).map((el) => ({ no, elId: el.id, path: el.imgPath })))
  const downloadAllElements = () => {
    const jobs = []
    parts.forEach((p) =>
      doneEls(p.part).forEach((el) => jobs.push({ no: p.part, elId: el.id, path: el.imgPath })),
    )
    runDownloadJobs(jobs)
  }

  // ── ② 배치 생성 ──
  const genOne = (no, entry) => {
    patchPart(no, { genStatus: "generating", genError: null, results: [] })
    const part = parts.find((p) => p.part === no)
    // 이미지가 생성·선택된 요소만 정밀 합성에 투입 (없으면 텍스트 프롬프트 경로)
    const selectedEls = (entry.elements || [])
      .filter((el) => el.imgStatus === "done" && el.imgSelected && el.imgPath)
      .map((el) => ({ name: el.name, path: el.imgPath }))
    const { prompt, useCompose, selectedPaths } = buildBgPrompt({
      subjects: entry.elements,
      selectedEls,
      finalPrompt: entry.finalPrompt,
      color: part && part.color,
      channelId,
    })
    const call = useCompose
      ? composeBackground(selectedPaths, prompt, { apiKey, n: entry.n || 1, ns: `part${no}` })
      : generateBackground(prompt, { apiKey, n: entry.n || 1, ns: `part${no}` })
    return call
      .then((r) => {
        if (r.success)
          patchPart(no, {
            genStatus: "done",
            results: r.results.map((x) => ({
              path: x.path,
              url: fileToUrl(x.path),
              selected: false,
              downloading: false,
              downloaded: false,
            })),
          })
        else patchPart(no, { genStatus: "error", genError: r.error || "생성 실패" })
      })
      .catch((e) => patchPart(no, { genStatus: "error", genError: String(e) }))
  }
  const generateAll = () => {
    setStage("gallery")
    const nos = parts.map((p) => p.part)
    // 대기열도 즉시 'queued'로 표시 (동시 3개 제한 — 나머지가 나중에 나타나 멈춘 것처럼 보이지 않게)
    nos.forEach((no) => patchPart(no, { genStatus: "queued", genError: null, results: [] }))
    const snap = store
    runPool(nos, 3, (no) => genOne(no, snap[no] || EMPTY))
  }
  const regenPart = (no) => genOne(no, getPart(no))
  const regenAll = () => {
    const nos = parts.map((p) => p.part)
    const snap = store
    nos.forEach((no) => patchPart(no, { genStatus: "queued", genError: null, results: [] }))
    runPool(nos, 3, (no) => genOne(no, snap[no] || EMPTY))
  }

  // ── 선택 다운로드 (폴더 저장) ──
  const selectedList = () => {
    const out = []
    parts.forEach((p) =>
      (getPart(p.part).results || []).forEach((r, i) => {
        if (r.selected) out.push({ no: p.part, i, path: r.path })
      }),
    )
    return out
  }
  const downloadSelected = () => {
    const sel = selectedList()
    if (!sel.length) return
    const dir = pickFolder()
    if (!dir) return
    setDlAll(true)
    sel.forEach(({ no, i, path }) => {
      const res = downloadImageTo(path, dir)
      if (res.success) {
        patchResult(no, i, { downloaded: true })
        setTimeout(() => patchResult(no, i, { downloaded: false }), 8000)
      }
    })
    setDlAll(false)
  }
  const toggleResult = (no, i) => {
    const cur = getPart(no).results[i]
    patchResult(no, i, { selected: !cur.selected })
  }
  const downloadOne = (no, i, path) => {
    const dir = pickFolder()
    if (!dir) return
    const res = downloadImageTo(path, dir)
    if (res.success) {
      patchResult(no, i, { downloaded: true })
      setTimeout(() => patchResult(no, i, { downloaded: false }), 8000)
    }
  }
  const appendResult = (no, r) =>
    setStore((s) => {
      const e = s[no] || EMPTY
      return { ...s, [no]: { ...e, results: [...e.results, r] } }
    })
  const removeResult = (no, i) =>
    setStore((s) => {
      const e = s[no] || EMPTY
      return { ...s, [no]: { ...e, results: e.results.filter((_, idx) => idx !== i) } }
    })

  // ── 결과를 프롬프트로 수정 (원본 유지, 새 변형으로 추가) ──
  const runEdit = () => {
    if (!editTarget || !editText.trim()) return
    const { no, path } = editTarget
    const part = parts.find((p) => p.part === no)
    setEditBusy(true)
    setEditError(null)
    editBackground(
      path,
      buildEditPrompt({ instruction: editText, color: part && part.color, channelId }),
      { apiKey, ns: `part${no}` },
    )
      .then((r) => {
        setEditBusy(false)
        if (r.success && r.results && r.results.length) {
          const np = r.results[0].path
          appendResult(no, {
            path: np,
            url: fileToUrl(np),
            selected: false,
            downloading: false,
            downloaded: false,
          })
          setEditTarget(null)
          setEditText("")
        } else {
          setEditError(r.error || "수정 실패")
        }
      })
      .catch((e) => {
        setEditBusy(false)
        setEditError(String(e))
      })
  }

  const partLabel = (p) => `${p.part}부${p.title ? " · " + p.title : ""}`
  const anyElements = hasParts && parts.some((p) => getPart(p.part).elements.length)
  const totalResults = hasParts
    ? parts.reduce((a, p) => a + getPart(p.part).results.length, 0)
    : 0
  const selectedCount = hasParts ? selectedList().length : 0
  const selectedElImgCount = hasParts
    ? parts.reduce(
        (a, p) =>
          a +
          getPart(p.part).elements.filter((el) => el.imgStatus === "done" && el.imgSelected).length,
        0,
      )
    : 0

  if (!hasParts) {
    return (
      <div className="text-xs text-muted-foreground text-center py-10 px-4 leading-relaxed">
        위에서 내용을 입력하고 <span className="text-foreground font-semibold">AI 자동 편성</span>을
        누르면,
        <br />
        각 부의 배경 파이프라인이 여기에 나타납니다.
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 스텝퍼 */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-1 text-xs">
        <StepBtn active={stage === "review"} onClick={() => setStage("review")}>
          ① 요소 검토
        </StepBtn>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        <StepBtn active={stage === "elements"} onClick={() => setStage("elements")}>
          ② 요소 이미지{selectedElImgCount > 0 ? ` (${selectedElImgCount})` : ""}
        </StepBtn>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        <StepBtn active={stage === "gallery"} onClick={() => setStage("gallery")}>
          ③ 결과{totalResults > 0 ? ` (${totalResults})` : ""}
        </StepBtn>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4">
        {stage === "review" ? (
          <ReviewAll
            parts={parts}
            getPart={getPart}
            partLabel={partLabel}
            onExtractAll={extractAll}
            onExtractOne={(no, text) => extractOne(no, text)}
            onGoElements={() => setStage("elements")}
            onGenerateAll={generateAll}
            patchElement={patchElement}
            regenPrompt={regenPrompt}
            addElement={addElement}
            removeElement={removeElement}
            patchPart={patchPart}
            anyElements={anyElements}
            apiKey={apiKey}
          />
        ) : stage === "elements" ? (
          <ElementImages
            parts={parts}
            getPart={getPart}
            partLabel={partLabel}
            onGenAll={genAllElementImages}
            onGenPart={genPartElementImages}
            onGenOne={genElementImage}
            onToggle={toggleElementImage}
            onDownloadOne={downloadOneElement}
            onDownloadPart={downloadPartElements}
            onDownloadAll={downloadAllElements}
            onBack={() => setStage("review")}
            onGenerateAll={generateAll}
            onZoom={(images, index) => setZoom({ images, index })}
            anyElements={anyElements}
            selectedElImgCount={selectedElImgCount}
            apiKey={apiKey}
            rmbgKey={rmbgKey}
          />
        ) : (
          <Gallery
            parts={parts}
            getPart={getPart}
            partLabel={partLabel}
            selectedCount={selectedCount}
            totalResults={totalResults}
            dlAll={dlAll}
            onRegenAll={regenAll}
            onDownloadSelected={downloadSelected}
            onToggle={toggleResult}
            onRegenPart={regenPart}
            onDownloadOne={downloadOne}
            onEdit={(no, i, path, url) => {
              setEditTarget({ no, i, path, url })
              setEditText("")
              setEditError(null)
            }}
            onRemove={removeResult}
            onZoom={(images, index) => setZoom({ images, index })}
          />
        )}
      </div>

      <ImageLightbox
        images={zoom?.images}
        index={zoom ? zoom.index : null}
        onClose={() => setZoom(null)}
        onIndex={(i) => setZoom((z) => ({ ...z, index: i }))}
      />

      {editTarget && (
        <EditModal
          target={editTarget}
          text={editText}
          setText={setEditText}
          busy={editBusy}
          error={editError}
          onApply={runEdit}
          onClose={() => {
            if (!editBusy) setEditTarget(null)
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────── 결과 수정(프롬프트) 모달 ───────────────────────────
function EditModal({ target, text, setText, busy, error, onApply, onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md flex flex-col gap-3 rounded-lg border border-border bg-neutral-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-blue-300" />
          <span className="text-sm font-semibold">프롬프트로 수정</span>
          <button
            onClick={onClose}
            disabled={busy}
            className="ml-auto text-muted-foreground hover:text-foreground disabled:opacity-40"
            title="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <img
          src={target.url}
          alt="수정할 배경"
          className="w-full rounded-md border border-border aspect-video object-cover"
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="바꾸고 싶은 부분을 지시하세요. 예: 오른쪽 배경을 더 밝게, 가운데 배터리 셀을 더 크게, 하단 차트 제거"
          rows={3}
          autoFocus
          className="w-full text-xs bg-transparent border border-border rounded-md px-2 py-1.5 outline-none focus:border-white/40 resize-y"
        />
        <p className="text-[10px] text-muted-foreground -mt-1">
          원본은 그대로 두고, 수정본이 그 부의 <span className="text-foreground">새 결과</span>로
          추가됩니다.
        </p>
        {error && <p className="text-[11px] text-red-400 break-words">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button size="sm" onClick={onApply} disabled={busy || !text.trim()}>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4 mr-1.5" />
            )}
            수정 생성
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────── 스텝 버튼 ───────────────────────────
function StepBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`font-semibold px-2.5 py-1 rounded-md ${
        active ? "bg-white text-black" : "text-muted-foreground hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  )
}

// ─────────────────────────── 상태 배지 ───────────────────────────
function StatusBadge({ status, kind }) {
  const map = {
    extracting: { t: "추출 중", c: "text-blue-300" },
    generating: { t: "생성 중", c: "text-blue-300" },
    done: { t: kind === "gen" ? "완료" : "추출됨", c: "text-green-400" },
    error: { t: "실패", c: "text-red-400" },
  }
  const s = map[status]
  if (!s) return null
  return (
    <span className={`flex items-center gap-1 text-[10px] ${s.c}`}>
      {(status === "extracting" || status === "generating") && (
        <Loader2 className="h-3 w-3 animate-spin" />
      )}
      {s.t}
    </span>
  )
}

function PartHeader({ p, partLabel, extractStatus, genStatus }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      {p.color && COLOR_DOT[p.color] && (
        <span
          className={`h-2.5 w-2.5 rounded-full shrink-0 ${COLOR_DOT[p.color]}`}
          title={COLOR_DESC[p.color]}
        />
      )}
      <span className="text-sm font-semibold truncate">{partLabel(p)}</span>
      <StatusBadge status={genStatus !== "idle" ? genStatus : extractStatus} kind={genStatus !== "idle" ? "gen" : "ext"} />
    </div>
  )
}

// ─────────────────────────── ① 요소 검토 ───────────────────────────
function ReviewAll({
  parts,
  getPart,
  partLabel,
  onExtractAll,
  onExtractOne,
  onGoElements,
  onGenerateAll,
  patchElement,
  regenPrompt,
  addElement,
  removeElement,
  patchPart,
  anyElements,
  apiKey,
}) {
  const [openParts, setOpenParts] = useState({})
  const isOpen = (no) => openParts[no] !== false // 기본 펼침
  const anyExtracting = parts.some((p) => getPart(p.part).extractStatus === "extracting")

  return (
    <div className="flex flex-col gap-3">
      {/* 전체 추출 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={onExtractAll} disabled={anyExtracting}>
          {anyExtracting ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4 mr-1.5" />
          )}
          전체 요소 추출
        </Button>
        <span className="text-[10px] text-muted-foreground">
          모든 부의 요소를 한 번에 추출합니다. 결과를 훑고 이상한 것만 수정하세요.
        </span>
      </div>

      {parts.map((p) => {
        const e = getPart(p.part)
        const open = isOpen(p.part)
        return (
          <div key={p.part} className="border border-border rounded-md bg-neutral-900/30">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                onClick={() => setOpenParts((o) => ({ ...o, [p.part]: !open }))}
                className="flex-1 min-w-0 text-left"
              >
                <PartHeader
                  p={p}
                  partLabel={partLabel}
                  extractStatus={e.extractStatus}
                  genStatus="idle"
                />
              </button>
              <span className="text-[10px] text-muted-foreground shrink-0">
                요소 {e.elements.length}
              </span>
              <button
                onClick={() => onExtractOne(p.part, p.text)}
                disabled={e.extractStatus === "extracting"}
                className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
                title="이 부만 다시 추출"
              >
                {e.extractStatus === "extracting" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {open && (
              <div className="flex flex-col gap-1.5 px-3 pb-3">
                {e.extractError && (
                  <div className="flex items-start gap-2 text-[11px] text-red-400">
                    <ImageOff className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span className="break-words">{e.extractError}</span>
                  </div>
                )}
                {e.elements.map((el) => (
                  <ElementRow
                    key={el.id}
                    el={el}
                    onChange={(patch) => patchElement(p.part, el.id, patch)}
                    onRegenPrompt={() => regenPrompt(p.part, el.id)}
                    onRemove={() => removeElement(p.part, el.id)}
                  />
                ))}
                {!e.elements.length && e.extractStatus !== "extracting" && (
                  <p className="text-[11px] text-muted-foreground py-1">
                    아직 요소가 없습니다. 위 "전체 요소 추출"을 누르세요.
                  </p>
                )}
                <button
                  onClick={() => addElement(p.part)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground self-start"
                >
                  <Plus className="h-3.5 w-3.5" />
                  요소 추가
                </button>
              </div>
            )}
          </div>
        )
      })}

      {/* 하단 액션: 요소 이미지(선택) / 바로 결과 */}
      <div className="flex items-center gap-2 mt-1">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={onGoElements}
          disabled={!anyElements}
        >
          <ImagePlus className="h-4 w-4 mr-1.5" />
          요소 이미지 생성
        </Button>
        <Button className="flex-1" onClick={onGenerateAll} disabled={!anyElements || !apiKey}>
          <Sparkles className="h-4 w-4 mr-1.5" />
          배경 생성
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────── ② 요소 이미지(선택) ───────────────────────────
function ElementImages({
  parts,
  getPart,
  partLabel,
  onGenAll,
  onGenPart,
  onGenOne,
  onToggle,
  onDownloadOne,
  onDownloadPart,
  onDownloadAll,
  onBack,
  onGenerateAll,
  onZoom,
  anyElements,
  selectedElImgCount,
  apiKey,
  rmbgKey,
}) {
  const [openParts, setOpenParts] = useState({})
  const isOpen = (no) => openParts[no] !== false // 기본 펼침
  const anyGenerating = parts.some((p) =>
    getPart(p.part).elements.some(
      (el) => el.imgStatus === "generating" || el.imgStatus === "queued",
    ),
  )
  const totalDoneImgs = parts.reduce(
    (a, p) => a + getPart(p.part).elements.filter((el) => el.imgStatus === "done").length,
    0,
  )

  // 라이트박스용 전체 이미지 URL 목록
  const allImgUrls = []
  parts.forEach((p) =>
    getPart(p.part).elements.forEach((el) => {
      if (el.imgStatus === "done" && el.imgUrl) allImgUrls.push(el.imgUrl)
    }),
  )
  const urlIndex = (url) => allImgUrls.indexOf(url)

  return (
    <div className="flex flex-col gap-3">
      {/* 안내 + 전체 생성 (보조 액션) */}
      <div className="flex items-start gap-2 flex-wrap">
        <Button
          size="sm"
          variant="secondary"
          onClick={onGenAll}
          disabled={!anyElements || !apiKey || anyGenerating}
        >
          {anyGenerating ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <ImagePlus className="h-4 w-4 mr-1.5" />
          )}
          전체 요소 이미지 생성
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDownloadAll}
          disabled={!totalDoneImgs || !rmbgKey}
          title={rmbgKey ? "생성된 요소 이미지를 배경제거 따서 저장" : "config.json removeBgApiKey 필요"}
        >
          <Download className="h-4 w-4 mr-1.5" />
          전체 배경제거 다운로드{totalDoneImgs ? ` (${totalDoneImgs})` : ""}
        </Button>
        <p className="text-[10px] text-muted-foreground flex-1 min-w-[180px] leading-relaxed">
          선택 단계입니다. 요소 이미지를 뽑아 <span className="text-foreground">선택</span>하면 그
          이미지를 배경에 정밀 합성합니다. 건너뛰고 바로 배경을 생성하면 텍스트 프롬프트만으로
          만듭니다. 배경제거 다운로드는 배경을 제거한 투명 PNG로 저장합니다.
        </p>
      </div>

      {parts.map((p) => {
        const e = getPart(p.part)
        const open = isOpen(p.part)
        const els = e.elements
        const doneCount = els.filter((el) => el.imgStatus === "done").length
        const partGenerating = els.some(
          (el) => el.imgStatus === "generating" || el.imgStatus === "queued",
        )
        const partHasPrompt = els.some((el) => (el.prompt || el.name || "").trim())
        return (
          <div key={p.part} className="border border-border rounded-md bg-neutral-900/30">
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                onClick={() => setOpenParts((o) => ({ ...o, [p.part]: !open }))}
                className="flex-1 min-w-0 flex items-center gap-2 text-left"
              >
                <PartHeader
                  p={p}
                  partLabel={partLabel}
                  extractStatus={e.extractStatus}
                  genStatus="idle"
                />
              </button>
              <span className="text-[10px] text-muted-foreground shrink-0">
                이미지 {doneCount}/{els.length}
              </span>
              <button
                onClick={() => onGenPart(p.part)}
                disabled={!partHasPrompt || !apiKey || partGenerating}
                className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:bg-white/5 disabled:opacity-40"
                title={`${p.part}부 요소 이미지 전체 생성`}
              >
                {partGenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ImagePlus className="h-3 w-3" />
                )}
                전체 생성
              </button>
              <button
                onClick={() => onDownloadPart(p.part)}
                disabled={!doneCount || !rmbgKey}
                className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:bg-white/5 disabled:opacity-40"
                title={rmbgKey ? `${p.part}부 요소 배경제거 다운로드` : "config.json removeBgApiKey 필요"}
              >
                <Download className="h-3 w-3" />
                배경제거
              </button>
            </div>
            {open && (
              <div className="px-3 pb-3">
                {!els.length && (
                  <p className="text-[11px] text-muted-foreground py-1">
                    요소가 없습니다. ① 요소 검토에서 추출하세요.
                  </p>
                )}
                {!!els.length && (
                  <div className="grid grid-cols-4 gap-1.5">
                    {els.map((el) => (
                      <ElementImageTile
                        key={el.id}
                        el={el}
                        rmbgKey={rmbgKey}
                        onGen={() => onGenOne(p.part, el.id)}
                        onToggle={() => onToggle(p.part, el.id)}
                        onDownload={() => onDownloadOne(p.part, el.id, el.imgPath)}
                        onZoom={() => el.imgUrl && onZoom(allImgUrls, urlIndex(el.imgUrl))}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* 하단 액션 */}
      <div className="flex items-center gap-2 mt-1">
        <Button variant="outline" size="sm" onClick={onBack}>
          ← 요소 검토
        </Button>
        <Button className="flex-1" onClick={onGenerateAll} disabled={!anyElements || !apiKey}>
          <Sparkles className="h-4 w-4 mr-1.5" />
          배경 생성 {selectedElImgCount > 0 ? `· 요소 ${selectedElImgCount}개 합성` : "· 텍스트"}
        </Button>
      </div>
    </div>
  )
}

function ElementImageTile({ el, rmbgKey, onGen, onToggle, onDownload, onZoom }) {
  const st = el.imgStatus || "idle"
  const dl = el.dlStatus // queued | cutting | done | error | null
  const hasPrompt = !!(el.prompt || el.name || "").trim()
  const imp = el.importance >= 1 && el.importance <= 3 ? el.importance : 2
  return (
    <div className="flex flex-col gap-1">
      <div
        className={`relative rounded-md overflow-hidden border-2 aspect-square bg-neutral-900 ${
          st === "done" && el.imgSelected ? "border-blue-500" : "border-border"
        }`}
      >
        {st === "done" ? (
          <>
            <img
              src={el.imgUrl}
              alt={el.name}
              onClick={onToggle}
              className="w-full h-full object-cover block cursor-pointer"
              title="클릭하여 합성 포함/제외"
            />
            {el.imgSelected && (
              <span className="absolute top-1 right-1 bg-blue-500 text-white rounded-full p-0.5">
                <Check className="h-3 w-3" />
              </span>
            )}
            <button
              onClick={onZoom}
              title="크게 보기"
              className="absolute top-1 left-1 rounded p-0.5 bg-black/70 text-white hover:bg-black/90"
            >
              <Maximize2 className="h-3 w-3" />
            </button>
            <button
              onClick={onGen}
              title="다시 생성"
              className="absolute bottom-1 right-1 rounded p-0.5 bg-black/70 text-white hover:bg-black/90"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
            <button
              onClick={onDownload}
              disabled={!rmbgKey || dl === "cutting" || dl === "queued"}
              title={rmbgKey ? "배경제거 따서 다운로드" : "config.json removeBgApiKey 필요"}
              className={`absolute bottom-1 left-1 rounded p-0.5 bg-black/70 hover:bg-black/90 disabled:opacity-40 ${
                dl === "done" ? "text-green-400" : "text-white"
              }`}
            >
              {dl === "cutting" || dl === "queued" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : dl === "done" ? (
                <Check className="h-3 w-3" />
              ) : (
                <Download className="h-3 w-3" />
              )}
            </button>
          </>
        ) : st === "queued" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground/50">
            <Loader2 className="h-4 w-4" />
            <span className="text-[9px]">대기 중</span>
          </div>
        ) : st === "generating" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-[10px]">생성 중…</span>
          </div>
        ) : st === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-red-400 px-2 text-center">
            <ImageOff className="h-5 w-5" />
            <span className="text-[9px] break-words line-clamp-2">{el.imgError}</span>
            <button
              onClick={onGen}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-border hover:bg-white/5 text-muted-foreground"
            >
              <RefreshCw className="h-3 w-3" />
              재생성
            </button>
          </div>
        ) : (
          <button
            onClick={onGen}
            disabled={!hasPrompt}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground hover:bg-white/5 disabled:opacity-40"
          >
            <ImagePlus className="h-4 w-4" />
            <span className="text-[9px] px-1 text-center leading-tight">
              {hasPrompt ? "이미지 생성" : "프롬프트 없음"}
            </span>
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-white/10 text-muted-foreground">
          {IMP_LABELS[imp]}
        </span>
        <span
          className="flex-1 min-w-0 text-[10px] text-muted-foreground truncate"
          title={el.name}
        >
          {el.name || "(이름 없음)"}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────── ③ 결과 갤러리 ───────────────────────────
function Gallery({
  parts,
  getPart,
  partLabel,
  selectedCount,
  totalResults,
  dlAll,
  onRegenAll,
  onDownloadSelected,
  onToggle,
  onRegenPart,
  onDownloadOne,
  onEdit,
  onRemove,
  onZoom,
}) {
  // 타일 목록 구성
  const tiles = []
  parts.forEach((p) => {
    const e = getPart(p.part)
    if (e.genStatus === "queued" && !e.results.length) {
      tiles.push({ key: `q${p.part}`, p, status: "queued" })
    } else if (e.genStatus === "generating" && !e.results.length) {
      tiles.push({ key: `g${p.part}`, p, status: "generating" })
    } else if (e.genStatus === "error") {
      tiles.push({ key: `e${p.part}`, p, status: "error", error: e.genError })
    } else {
      e.results.forEach((r, i) =>
        tiles.push({ key: `${p.part}-${i}`, p, status: "done", r, i, total: e.results.length }),
      )
    }
  })

  const allUrls = tiles.filter((t) => t.status === "done").map((t) => t.r.url)
  const urlIndex = (url) => allUrls.indexOf(url)

  return (
    <div className="flex flex-col gap-3">
      {/* 툴바 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground">
          결과 {totalResults}개 · {selectedCount}개 선택됨
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={onRegenAll}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:bg-white/5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            전체 재생성
          </button>
          <Button
            size="sm"
            onClick={onDownloadSelected}
            disabled={dlAll || !selectedCount}
          >
            {dlAll ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1.5" />
            )}
            선택 다운로드
          </Button>
        </div>
      </div>

      {!tiles.length && (
        <p className="text-[11px] text-muted-foreground text-center py-8">
          아직 생성된 결과가 없습니다. "① 요소 검토"에서 전체 배경 생성을 누르세요.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <div key={t.key} className="flex flex-col gap-1">
            <div
              className={`relative rounded-md overflow-hidden border-2 aspect-video bg-neutral-900 ${
                t.status === "done" && t.r.selected ? "border-blue-500" : "border-border"
              }`}
            >
              {t.status === "queued" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground/50">
                  <Loader2 className="h-5 w-5" />
                  <span className="text-[10px]">대기 중</span>
                </div>
              )}
              {t.status === "generating" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-[10px]">생성 중…</span>
                </div>
              )}
              {t.status === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-red-400 px-2 text-center">
                  <ImageOff className="h-5 w-5" />
                  <span className="text-[9px] break-words line-clamp-2">{t.error}</span>
                  <button
                    onClick={() => onRegenPart(t.p.part)}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-border hover:bg-white/5 text-muted-foreground"
                  >
                    <RefreshCw className="h-3 w-3" />
                    재생성
                  </button>
                </div>
              )}
              {t.status === "done" && (
                <>
                  <img
                    src={t.r.url}
                    alt="background"
                    onClick={() => onToggle(t.p.part, t.i)}
                    className="w-full h-full object-cover block cursor-pointer"
                    title="클릭하여 선택"
                  />
                  {t.r.selected && (
                    <span className="absolute top-1 right-1 bg-blue-500 text-white rounded-full p-0.5">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  <button
                    onClick={() => onZoom(allUrls, urlIndex(t.r.url))}
                    title="크게 보기"
                    className="absolute top-1 left-1 rounded p-0.5 bg-black/70 text-white hover:bg-black/90"
                  >
                    <Maximize2 className="h-3 w-3" />
                  </button>
                  {t.total > 1 && (
                    <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[9px] px-1 rounded">
                      {t.i + 1}/{t.total}
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="flex-1 min-w-0 text-[10px] text-muted-foreground truncate">
                {partLabel(t.p)}
              </span>
              {t.status === "done" && (
                <>
                  <button
                    onClick={() => onEdit(t.p.part, t.i, t.r.path, t.r.url)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    title="프롬프트로 수정"
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onRegenPart(t.p.part)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    title="이 부 재생성"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onDownloadOne(t.p.part, t.i, t.r.path)}
                    className={`shrink-0 ${
                      t.r.downloaded ? "text-green-400" : "text-muted-foreground hover:text-foreground"
                    }`}
                    title="다운로드"
                  >
                    {t.r.downloaded ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => onRemove(t.p.part, t.i)}
                    className="shrink-0 text-muted-foreground hover:text-red-400"
                    title="이 결과 삭제"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
