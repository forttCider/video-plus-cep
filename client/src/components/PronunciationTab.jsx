import React, { useState, useEffect, useMemo, useCallback } from "react"
import {
  Mic,
  Loader2,
  Play,
  GraduationCap,
  RefreshCw,
  Wand2,
  ArrowDownToLine,
  AlertTriangle,
  Check,
} from "lucide-react"
import { Button } from "./ui/button"
import {
  loadVoiceStore,
  saveVoiceStore,
  renderSpeakerTrack,
  extractVoiceSampleMulti,
  measureLufs,
  cloneVoice,
  deleteVoice,
  synthesizeTts,
  insertTtsAudioClip,
  fileToUrl,
} from "../js/tts-bridge"
import { getTimelinePositionTick } from "../js/calculateTimeOffset"
import { TICKS_PER_SECOND } from "../js/initWords"

/**
 * 발음 교정 탭
 * 1) 화자 선택 → 받아쓰기 발화에서 10초 샘플 추출 → ElevenLabs 보이스 학습
 * 2) 발음이 부정확한 문장/워드 범위 선택 → 교정 텍스트 입력 → 합성 (원본 구간
 *    길이에 정합된 WAV) → 미리듣기
 * 3) 해당 화자 트랙의 정확한 틱 위치에 overwrite (뒤 클립 안 밀림 = 싱크 유지)
 */

// 학습 샘플 목표/상한 (길수록 화자 유사도·채널 특성 재현 향상 — v2.1에서 10→30초)
const SAMPLE_TARGET_SEC = 30
const SAMPLE_MAX_SEC = 60

// 워드 유효성: 마커/무음 등 합성 대상이 아닌 항목 제외
function isRealWord(w) {
  return (
    w &&
    w.text != null &&
    typeof w.start_at === "number" &&
    typeof w.end_at === "number" &&
    w.start_at_tick != null &&
    w.end_at_tick != null
  )
}

function fmtSec(ms) {
  const s = ms / 1000
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`
}

function sentenceText(sentence) {
  return (sentence.words || [])
    .filter(isRealWord)
    .map((w) => w.text)
    .join(" ")
}

export default function PronunciationTab({
  isConnected,
  sentences,
  spkNames,
  sequenceInfo,
  availableAudioTracks,
  addLog,
}) {
  // ── 학습 상태 ──
  const [spk, setSpk] = useState(null)
  const [trackIndex, setTrackIndex] = useState(null)
  const [sampleIds, setSampleIds] = useState(new Set()) // 다중 선택 (누적 30초 목표)
  const [samplePath, setSamplePath] = useState(null)
  const [voiceStore, setVoiceStore] = useState({})
  const [trainPhase, setTrainPhase] = useState(null) // null | "render" | "extract" | "clone"
  const [trainError, setTrainError] = useState(null)

  // ── 교정/합성 상태 ──
  const [targetSentenceId, setTargetSentenceId] = useState(null)
  const [rangeStart, setRangeStart] = useState(null) // word index
  const [rangeEnd, setRangeEnd] = useState(null)
  const [correctedText, setCorrectedText] = useState("")
  const [synthesizing, setSynthesizing] = useState(false)
  const [synthResult, setSynthResult] = useState(null) // {path, appliedTempo}
  const [synthError, setSynthError] = useState(null)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState(null)

  const sequenceId = sequenceInfo?.id

  // voice store 로드 (시퀀스별 영속 — 화자당 1회 학습)
  useEffect(() => {
    setVoiceStore(loadVoiceStore(sequenceId))
  }, [sequenceId])

  // 화자 목록 (살아있는 워드가 있는 화자만)
  const speakers = useMemo(() => {
    const set = new Set()
    for (const s of sentences || []) {
      if ((s.words || []).some((w) => isRealWord(w) && !w.is_deleted)) {
        set.add(s.spk || 0)
      }
    }
    return [...set].sort((a, b) => a - b)
  }, [sentences])

  // 화자의 발화 목록 (샘플/교정 후보 — 삭제 안 된 워드 보유)
  const spkSentences = useMemo(() => {
    if (spk == null) return []
    return (sentences || []).filter(
      (s) =>
        (s.spk || 0) === spk &&
        (s.words || []).some((w) => isRealWord(w) && !w.is_deleted),
    )
  }, [sentences, spk])

  // 샘플 후보: 길이순 상위 (기본값 = 누적 30초까지 자동 선택)
  const sampleCandidates = useMemo(() => {
    return [...spkSentences]
      .map((s) => {
        const words = (s.words || []).filter((w) => isRealWord(w) && !w.is_deleted)
        if (!words.length) return null
        const durMs = words[words.length - 1].end_at - words[0].start_at
        return { sentence: s, words, durMs }
      })
      .filter(Boolean)
      .sort((a, b) => b.durMs - a.durMs)
      .slice(0, 12)
  }, [spkSentences])

  const selectedSampleSec = useMemo(
    () =>
      sampleCandidates
        .filter((c) => sampleIds.has(c.sentence.id))
        .reduce((sum, c) => sum + c.durMs / 1000, 0),
    [sampleCandidates, sampleIds],
  )

  // 화자 변경 시 기본값 재설정
  useEffect(() => {
    if (spk == null) return
    // 길이순으로 누적 30초까지 자동 선택
    const ids = new Set()
    let acc = 0
    for (const c of sampleCandidates) {
      if (acc >= SAMPLE_TARGET_SEC) break
      ids.add(c.sentence.id)
      acc += c.durMs / 1000
    }
    setSampleIds(ids)
    setSamplePath(null)
    setTrainError(null)
    setTargetSentenceId(null)
    setSynthResult(null)
    setSynthError(null)
    setApplyResult(null)
    // 기본 트랙: 화자 순번째 선택 가능 트랙 (받아쓰기 시 트랙 순서 = 화자 번호)
    const tracks = availableAudioTracks || []
    const spkOrder = speakers.indexOf(spk)
    setTrackIndex(tracks[spkOrder]?.trackIndex ?? tracks[0]?.trackIndex ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spk])

  const trainedVoice = spk != null ? voiceStore[spk] : null

  const spkLabel = useCallback(
    (id) => (spkNames && spkNames[id] ? spkNames[id] : `화자 ${id + 1}`),
    [spkNames],
  )

  // ── 1) 샘플 추출 + 학습 ──
  const handleTrain = async () => {
    if (spk == null || trackIndex == null) return
    const selected = sampleCandidates.filter((c) => sampleIds.has(c.sentence.id))
    if (!selected.length) {
      setTrainError("샘플로 쓸 발화를 선택해주세요.")
      return
    }
    setTrainError(null)
    setSamplePath(null)
    try {
      // 1) 화자 트랙만 재렌더 (받아쓰기용 파일은 STT 후 정리되므로 다시 렌더)
      setTrainPhase("render")
      addLog?.("info", `[발음교정] ${spkLabel(spk)} 트랙(A${trackIndex + 1}) 렌더링 중...`)
      const render = await renderSpeakerTrack(trackIndex)
      if (!render.success) throw new Error(render.error)

      // 2) 선택 발화들을 타임라인 순서로 잘라 이어붙임 (누적 상한 60초)
      //    각 위치는 컷편집 삭제 보정 포함 (getTimelinePositionTick)
      setTrainPhase("extract")
      const ordered = [...selected].sort((a, b) => a.words[0].start_at - b.words[0].start_at)
      const segments = []
      let acc = 0
      for (const c of ordered) {
        if (acc >= SAMPLE_MAX_SEC) break
        const { startTick } = getTimelinePositionTick(c.words[0], sentences)
        const startSec = Number(startTick) / Number(TICKS_PER_SECOND)
        const durSec = Math.min(c.durMs / 1000, SAMPLE_MAX_SEC - acc)
        segments.push({ startSec, durSec })
        acc += durSec
      }
      const sample = await extractVoiceSampleMulti(render.outputPath, segments, spk)
      if (!sample.success) throw new Error(sample.error)
      setSamplePath(sample.path)

      // 3) 원본 트랙 음량 기억 → 합성 시 라우드니스 매칭 (실패해도 학습은 진행)
      const lufs = await measureLufs(sample.path)
      if (!lufs.success) {
        addLog?.("warn", `[발음교정] 음량(LUFS) 측정 실패 — 음량 매칭 없이 진행: ${lufs.error}`)
      }

      // 4) 학습 (재학습이면 기존 보이스 삭제 후 교체 — 슬롯 한도 관리)
      setTrainPhase("clone")
      if (trainedVoice?.voiceId) {
        const del = await deleteVoice(trainedVoice.voiceId)
        if (!del.success) addLog?.("warn", `[발음교정] 기존 보이스 삭제 실패(무시): ${del.error}`)
      }
      const title = `videoplus-${sequenceId || "seq"}-spk${spk}-${spkLabel(spk)}`
      const clone = await cloneVoice(sample.path, title)
      if (!clone.success) throw new Error(clone.error)

      const next = {
        ...voiceStore,
        [spk]: {
          voiceId: clone.voiceId,
          title,
          trainedAt: new Date().toISOString(),
          sampleSentenceIds: [...sampleIds],
          sampleSec: Math.round(acc),
          targetLufs: lufs.success ? lufs.lufs : null,
        },
      }
      setVoiceStore(next)
      saveVoiceStore(sequenceId, next)
      addLog?.("info", `[발음교정] ${spkLabel(spk)} 보이스 학습 완료 (${clone.voiceId})`)
    } catch (e) {
      setTrainError(e.message || String(e))
      addLog?.("error", `[발음교정] 학습 실패: ${e.message || e}`)
    } finally {
      setTrainPhase(null)
    }
  }

  // ── 2) 교정 대상 범위 ──
  const targetSentence = useMemo(
    () => spkSentences.find((s) => s.id === targetSentenceId) || null,
    [spkSentences, targetSentenceId],
  )
  const targetWords = useMemo(
    () => (targetSentence ? (targetSentence.words || []).filter(isRealWord) : []),
    [targetSentence],
  )

  // 문장 선택 시 범위/텍스트 초기화 (기본 = 전체)
  useEffect(() => {
    if (!targetSentence) return
    setRangeStart(0)
    setRangeEnd(targetWords.length - 1)
    setCorrectedText(targetWords.map((w) => w.text).join(" "))
    setSynthResult(null)
    setSynthError(null)
    setApplyResult(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSentenceId])

  const handleWordChipClick = (idx) => {
    if (rangeStart == null || idx < rangeStart || (rangeStart != null && rangeEnd != null && rangeStart !== rangeEnd)) {
      // 새 범위 시작
      setRangeStart(idx)
      setRangeEnd(idx)
    } else {
      // 범위 끝 확장
      setRangeEnd(Math.max(idx, rangeStart))
    }
    setSynthResult(null)
    setApplyResult(null)
  }

  // 범위 변경 시 원본 텍스트 프리필
  useEffect(() => {
    if (rangeStart == null || rangeEnd == null || !targetWords.length) return
    setCorrectedText(
      targetWords
        .slice(rangeStart, rangeEnd + 1)
        .map((w) => w.text)
        .join(" "),
    )
  }, [rangeStart, rangeEnd, targetWords])

  const rangeWords = useMemo(() => {
    if (rangeStart == null || rangeEnd == null) return []
    return targetWords.slice(rangeStart, rangeEnd + 1)
  }, [targetWords, rangeStart, rangeEnd])

  const rangeHasDeleted = rangeWords.some((w) => w.is_deleted)
  const targetDurationMs = rangeWords.length
    ? rangeWords[rangeWords.length - 1].end_at - rangeWords[0].start_at
    : 0

  // ── 3) 합성 ──
  const handleSynthesize = async () => {
    if (!trainedVoice?.voiceId || !rangeWords.length || !correctedText.trim()) return
    setSynthesizing(true)
    setSynthError(null)
    setSynthResult(null)
    setApplyResult(null)
    try {
      const r = await synthesizeTts({
        voiceId: trainedVoice.voiceId,
        text: correctedText.trim(),
        targetDurationMs,
        targetLufs: typeof trainedVoice.targetLufs === "number" ? trainedVoice.targetLufs : undefined,
      })
      if (!r.success) {
        if (r.voiceNotFound) {
          // 서버/ElevenLabs에서 보이스가 사라짐 → 저장 무효화 + 재학습 유도
          const next = { ...voiceStore }
          delete next[spk]
          setVoiceStore(next)
          saveVoiceStore(sequenceId, next)
          throw new Error("보이스가 만료되었습니다. 다시 학습해주세요.")
        }
        throw new Error(r.error)
      }
      setSynthResult(r)
      addLog?.("info", `[발음교정] 합성 완료 (속도 보정 ×${r.appliedTempo.toFixed(2)})`)
    } catch (e) {
      setSynthError(e.message || String(e))
      addLog?.("error", `[발음교정] 합성 실패: ${e.message || e}`)
    } finally {
      setSynthesizing(false)
    }
  }

  // ── 4) 타임라인 반영 ──
  const handleApply = async () => {
    if (!synthResult?.path || !rangeWords.length || trackIndex == null) return
    setApplying(true)
    setApplyResult(null)
    setSynthError(null)
    try {
      const firstWord = rangeWords[0]
      const lastWord = rangeWords[rangeWords.length - 1]
      const { startTick } = getTimelinePositionTick(firstWord, sentences)
      const durationTick = BigInt(lastWord.end_at_tick) - BigInt(firstWord.start_at_tick)
      const r = await insertTtsAudioClip(
        synthResult.path,
        trackIndex,
        startTick.toString(),
        durationTick.toString(),
      )
      if (!r || !r.success) throw new Error((r && r.error) || "타임라인 반영 실패")
      setApplyResult(r)
      addLog?.(
        "info",
        `[발음교정] A${trackIndex + 1} 트랙 반영 완료 (start=${r.clipStartTicks} ticks)${r.warning ? ` — ${r.warning}` : ""}`,
      )
    } catch (e) {
      setSynthError(e.message || String(e))
      addLog?.("error", `[발음교정] 반영 실패: ${e.message || e}`)
    } finally {
      setApplying(false)
    }
  }

  const tempoWarn =
    synthResult && (synthResult.appliedTempo < 0.8 || synthResult.appliedTempo > 1.2)

  // ── 렌더 ──
  if (!sentences || sentences.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground px-8 text-center">
        발음 교정은 받아쓰기 결과가 필요합니다.
        <br />
        먼저 컷편집 탭에서 받아쓰기를 실행해주세요.
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto px-4 py-3 gap-4 text-sm">
      {/* ── 1. 보이스 학습 ── */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <Mic className="h-3.5 w-3.5" /> 1. 출연자 보이스 학습
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            data-testid="tts-speaker-select"
            className="bg-transparent border border-border rounded-md px-2 py-1 text-xs outline-none"
            value={spk ?? ""}
            onChange={(e) => setSpk(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">화자 선택</option>
            {speakers.map((id) => (
              <option key={id} value={id}>
                {spkLabel(id)} {voiceStore[id] ? "· 학습됨" : ""}
              </option>
            ))}
          </select>
          <select
            data-testid="tts-track-select"
            className="bg-transparent border border-border rounded-md px-2 py-1 text-xs outline-none"
            value={trackIndex ?? ""}
            onChange={(e) => setTrackIndex(Number(e.target.value))}
            disabled={spk == null}
            title="이 화자의 오디오가 있는 트랙 (샘플 추출 + 반영 대상)"
          >
            {(availableAudioTracks || []).map((t) => (
              <option key={t.trackIndex} value={t.trackIndex}>
                A{t.trackIndex + 1} {t.name ? `(${t.name})` : ""}
              </option>
            ))}
          </select>
        </div>

        {spk != null && (
          <>
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">
                학습 샘플 발화 — 목표 {SAMPLE_TARGET_SEC}초 자동 선택, 클릭으로 조정 (현재{" "}
                <span className={selectedSampleSec >= SAMPLE_TARGET_SEC ? "text-green-400" : "text-amber-400"}>
                  {selectedSampleSec.toFixed(1)}초
                </span>
                {selectedSampleSec > SAMPLE_MAX_SEC ? ` / 상한 ${SAMPLE_MAX_SEC}초까지만 사용` : ""})
              </div>
              <div
                data-testid="tts-sample-select"
                className="max-h-32 overflow-y-auto border border-border rounded-md divide-y divide-border"
              >
                {sampleCandidates.map((c) => {
                  const on = sampleIds.has(c.sentence.id)
                  return (
                    <button
                      key={c.sentence.id}
                      className={`w-full text-left px-2 py-1.5 text-xs leading-snug ${
                        on ? "bg-white/10 text-white" : "text-muted-foreground hover:bg-white/5"
                      }`}
                      onClick={() => {
                        const next = new Set(sampleIds)
                        if (on) next.delete(c.sentence.id)
                        else next.add(c.sentence.id)
                        setSampleIds(next)
                      }}
                    >
                      <span className={`text-[10px] mr-1.5 ${on ? "text-green-400" : "opacity-60"}`}>
                        {on ? "✓ " : ""}
                        {fmtSec(c.words[0].start_at)} · {(c.durMs / 1000).toFixed(1)}s
                      </span>
                      {sentenceText(c.sentence).slice(0, 80)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                data-testid="tts-train-button"
                size="sm"
                onClick={handleTrain}
                disabled={!isConnected || trainPhase != null || sampleIds.size === 0}
              >
                {trainPhase ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    {trainPhase === "render" && "트랙 렌더링 중..."}
                    {trainPhase === "extract" && "샘플 추출 중..."}
                    {trainPhase === "clone" && "보이스 학습 중..."}
                  </>
                ) : trainedVoice ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> 재학습
                  </>
                ) : (
                  <>
                    <GraduationCap className="h-3.5 w-3.5 mr-1" /> 보이스 학습
                  </>
                )}
              </Button>
              {trainedVoice && !trainPhase && (
                <span className="text-[11px] text-green-400 flex items-center gap-1">
                  <Check className="h-3 w-3" /> 학습됨 (
                  {new Date(trainedVoice.trainedAt).toLocaleDateString("ko-KR")})
                </span>
              )}
              {samplePath && !trainPhase && (
                <audio controls src={fileToUrl(samplePath)} className="h-7 max-w-[180px]" />
              )}
            </div>
            {trainError && <div className="text-xs text-red-400">{trainError}</div>}
          </>
        )}
      </section>

      {/* ── 2. 교정 구간 + 합성 ── */}
      {spk != null && trainedVoice && (
        <section className="space-y-2 border-t border-border pt-3">
          <h3 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Wand2 className="h-3.5 w-3.5" /> 2. 발음 교정 구간
          </h3>
          <div
            data-testid="tts-sentence-list"
            className="max-h-40 overflow-y-auto border border-border rounded-md divide-y divide-border"
          >
            {spkSentences.map((s) => (
              <button
                key={s.id}
                className={`w-full text-left px-2 py-1.5 text-xs leading-snug ${
                  targetSentenceId === s.id
                    ? "bg-white/10 text-white"
                    : "text-muted-foreground hover:bg-white/5"
                }`}
                onClick={() => setTargetSentenceId(s.id)}
              >
                <span className="text-[10px] mr-1.5 opacity-60">
                  {fmtSec((s.words || []).filter(isRealWord)[0]?.start_at || 0)}
                </span>
                {sentenceText(s).slice(0, 80)}
              </button>
            ))}
          </div>

          {targetSentence && (
            <>
              <div className="space-y-1">
                <div className="text-[11px] text-muted-foreground">
                  워드 범위 (클릭=시작, 다시 클릭=끝 · 기본 전체)
                </div>
                <div className="flex flex-wrap gap-1">
                  {targetWords.map((w, idx) => {
                    const inRange =
                      rangeStart != null && rangeEnd != null && idx >= rangeStart && idx <= rangeEnd
                    return (
                      <button
                        key={w.id || idx}
                        className={`px-1.5 py-0.5 rounded text-xs border ${
                          w.is_deleted
                            ? "border-red-500/40 text-red-400 line-through"
                            : inRange
                              ? "bg-white text-black border-white"
                              : "border-border text-muted-foreground hover:bg-white/10"
                        }`}
                        onClick={() => handleWordChipClick(idx)}
                      >
                        {w.text}
                      </button>
                    )
                  })}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  구간 길이: {(targetDurationMs / 1000).toFixed(2)}초
                </div>
              </div>

              {rangeHasDeleted && (
                <div className="text-xs text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  선택 범위에 삭제된 워드가 있어 반영할 수 없습니다. 범위를 다시
                  선택해주세요. (삭제 구간은 타임라인 길이와 어긋납니다)
                </div>
              )}

              <textarea
                data-testid="tts-correct-input"
                value={correctedText}
                onChange={(e) => setCorrectedText(e.target.value)}
                rows={2}
                placeholder="교정 텍스트 (원본과 비슷한 길이 권장)"
                className="w-full text-xs bg-transparent border border-border rounded-md px-2 py-1.5 outline-none focus:border-white/40 resize-none"
              />

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  data-testid="tts-synthesize-button"
                  size="sm"
                  onClick={handleSynthesize}
                  disabled={
                    !isConnected ||
                    synthesizing ||
                    rangeHasDeleted ||
                    !rangeWords.length ||
                    !correctedText.trim()
                  }
                >
                  {synthesizing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 합성 중...
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 mr-1" /> 합성 + 미리듣기
                    </>
                  )}
                </Button>
                {synthResult && (
                  <>
                    <audio controls src={fileToUrl(synthResult.path)} className="h-7 max-w-[180px]" />
                    {tempoWarn && (
                      <span className="text-[11px] text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        속도 보정 ×{synthResult.appliedTempo.toFixed(2)} — 부자연스러울 수
                        있어요. 텍스트 길이를 조정해보세요.
                      </span>
                    )}
                  </>
                )}
              </div>

              {synthResult && (
                <div className="flex items-center gap-2">
                  <Button
                    data-testid="tts-apply-button"
                    size="sm"
                    variant="secondary"
                    onClick={handleApply}
                    disabled={applying || rangeHasDeleted}
                  >
                    {applying ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> 반영 중...
                      </>
                    ) : (
                      <>
                        <ArrowDownToLine className="h-3.5 w-3.5 mr-1" /> A{(trackIndex ?? 0) + 1}{" "}
                        트랙에 반영
                      </>
                    )}
                  </Button>
                  {applyResult && (
                    <span className="text-[11px] text-green-400 flex items-center gap-1">
                      <Check className="h-3 w-3" /> 반영 완료 — 원본 구간을 덮어썼습니다
                      (Ctrl/Cmd+Z로 되돌리기 가능)
                    </span>
                  )}
                </div>
              )}

              {synthError && <div className="text-xs text-red-400">{synthError}</div>}
            </>
          )}
        </section>
      )}
    </div>
  )
}
