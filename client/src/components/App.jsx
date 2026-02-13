import React, { useState, useEffect, useRef } from "react"
import "./css/App.css"
import {
  testConnection,
  getActiveSequenceInfo,
  setPlayerPosition,
  setPlayerPositionByTicks,
  getPlayerPosition,
  backupSequence,
  getBackupList,
  openBackupSequence,
  restoreFromBackup,
  saveWordsData,
  loadWordsData,
} from "../js/cep-bridge"
import useAudioUpload from "../hooks/useAudioUpload"
import initWords from "../js/initWords"
import Sentence from "./Sentence"
import ContextMenu from "./ContextMenu"
import {
  getTimelinePosition,
  getTimelinePositionTick,
  buildTimelineIndex,
  findCurrentWordFromIndex,
} from "../js/calculateTimeOffset"
import { deleteWordFromTimeline } from "../js/deleteWord"
import { restoreWordFromTimeline } from "../js/restoreWord"
import {
  batchDeleteWords,
  applyDeleteResult,
  FILLER_TYPES,
} from "../js/batchEditWords"

const API_URL =
  process.env.REACT_APP_VIDEO_API_URL || "https://vapi.cidermics.com"

/**
 * 랜덤 ID 생성
 */
function generateRandomId() {
  return Math.random().toString(36).substring(2, 15)
}

/**
 * 초 → 분:초 포맷
 */
function formatTime(seconds) {
  if (!seconds && seconds !== 0) return "00:00"
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
}

/**
 * 밀리초 → 분:초 포맷
 */
function formatTimeMs(ms) {
  if (!ms && ms !== 0) return "00:00"
  return formatTime(ms / 1000)
}

/**
 * 메인 앱 컴포넌트
 */
export default function App() {
  const [status, setStatus] = useState("로딩 중...")
  const [isConnected, setIsConnected] = useState(false)
  const [sequenceInfo, setSequenceInfo] = useState(null)
  const [error, setError] = useState(null)
  const [sentences, setSentences] = useState([])
  const [currentWordId, setCurrentWordId] = useState(null)
  const [searchResultsSet, setSearchResultsSet] = useState(new Set())
  const [currentSearchWordId, setCurrentSearchWordId] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [batchProgress, setBatchProgress] = useState(null) // { current, total, label }
  const [showHistory, setShowHistory] = useState(false)
  const [backupList, setBackupList] = useState([])
  const wordRefs = useRef({})
  const sentencesRef = useRef(sentences)
  const timelineIndexRef = useRef(null)

  // sentences 변경 시 ref 및 타임라인 인덱스 업데이트
  useEffect(() => {
    sentencesRef.current = sentences
    if (sentences.length > 0) {
      timelineIndexRef.current = buildTimelineIndex(sentences)
    }
  }, [sentences])

  // 플레이어 위치 폴링 → 현재 단어 하이라이트
  useEffect(() => {
    if (!isConnected || sentences.length === 0 || isProcessing) return

    const pollInterval = setInterval(async () => {
      try {
        const result = await getPlayerPosition()
        if (result?.success && timelineIndexRef.current) {
          const found = findCurrentWordFromIndex(
            timelineIndexRef.current,
            result.seconds,
          )
          if (found?.word) {
            setCurrentWordId(found.word.start_at)
          }
        }
      } catch (e) {
        // 폴링 에러 무시
      }
    }, 100) // 100ms 간격

    return () => clearInterval(pollInterval)
  }, [isConnected, sentences.length, isProcessing])

  // 현재 단어 변경 시 자동 스크롤
  useEffect(() => {
    if (!currentWordId || !wordRefs.current[currentWordId]) return

    const wordEl = wordRefs.current[currentWordId]
    wordEl.scrollIntoView({ behavior: "instant", block: "center" })
  }, [currentWordId])

  // 단어 클릭 핸들러 (ref 사용으로 최신 sentences 참조)
  const handleWordClick = async (word) => {
    // tick 기반으로 계산 (정밀도 손실 없이 직접 전달)
    const { startTick } = getTimelinePositionTick(word, sentencesRef.current)
    setCurrentWordId(word.start_at)
    await setPlayerPositionByTicks(startTick.toString())
  }

  // 단어 우클릭 핸들러 (컨텍스트 메뉴)
  const handleWordContextMenu = (e, word, sentenceStartAt) => {
    e.preventDefault()
    setContextMenu({
      position: { x: e.clientX, y: e.clientY },
      word,
      sentenceStartAt,
    })
  }

  // 컨텍스트 메뉴 닫기
  const handleCloseContextMenu = () => {
    setContextMenu(null)
  }

  // 단어 삭제 (XML 방식)
  const handleDeleteWord = async () => {
    if (isProcessing || !contextMenu) return
    setIsProcessing(true)

    const word = contextMenu.word

    try {
      // razor 방식으로 삭제
      const result = await deleteWordFromTimeline(word, sentences)

      if (!result.success) {
        console.error("Failed to delete word:", result.error)
        alert("삭제 실패: " + (result.error || "알 수 없는 오류"))
        setIsProcessing(false)
        setContextMenu(null)
        return
      }

      // 상태 업데이트 (isDeleted만 설정)
      setSentences((prev) => {
        const updated = prev.map((s) => {
          if (s.start_at !== contextMenu.sentenceStartAt) return s
          return {
            ...s,
            words: s.words.map((w) => {
              if (w.start_at !== word.start_at) return w
              return { ...w, isDeleted: true }
            }),
          }
        })
        // ref도 즉시 업데이트 (클로저 문제 해결)
        sentencesRef.current = updated
        return updated
      })

    } catch (error) {
      console.error("Failed to delete word:", error)
      alert("삭제 실패: " + error.message)
    } finally {
      setIsProcessing(false)
    }

    setContextMenu(null)
  }

  // 단어 복구
  const handleRestoreWord = async () => {
    if (isProcessing || !contextMenu) return
    setIsProcessing(true)

    const word = contextMenu.word

    try {
      // razor 방식으로 복원
      const result = await restoreWordFromTimeline(word, sentences)

      if (!result.success) {
        console.error("Failed to restore word:", result.error)
        alert("복원 실패: " + (result.error || "알 수 없는 오류"))
        setIsProcessing(false)
        setContextMenu(null)
        return
      }

      // 상태 업데이트
      setSentences((prev) => {
        const updated = prev.map((s) => {
          if (s.start_at !== contextMenu.sentenceStartAt) return s
          return {
            ...s,
            words: s.words.map((w) => {
              if (w.start_at !== word.start_at) return w
              return { ...w, isDeleted: false }
            }),
          }
        })
        // ref도 즉시 업데이트
        sentencesRef.current = updated
        return updated
      })

    } catch (error) {
      console.error("Failed to restore word:", error)
      alert("복원 실패: " + error.message)
    } finally {
      setIsProcessing(false)
    }

    setContextMenu(null)
  }

  // 범위 표시
  const handleMark = async () => {
    if (!contextMenu) return
    const word = contextMenu.word

    // TODO: markWord 구현 (시퀀스 마커 추가)

    setContextMenu(null)
  }

  // 문장 삭제 핸들러 (타임라인 실제 삭제 + 백업)
  const handleDeleteSentence = async (sentence) => {
    if (isProcessing) return
    setIsProcessing(true)
    setStatus("백업 중...")

    try {
      // 삭제 전 백업 (첫 단어 ~ 끝 단어로 이름 생성)
      const words = sentence.words.filter(w => !w.isDeleted && (w.word || w.text))
      const firstWord = words[0]?.word || words[0]?.text || ''
      const lastWord = words[words.length - 1]?.word || words[words.length - 1]?.text || ''
      const backupName = `문장삭제전 - [${firstWord} ~ ${lastWord}]`
      const backupResult = await backupSequence(backupName)
      if (backupResult?.success) {
        const wordsResult = await saveWordsData(backupResult.backupId, sentencesRef.current)
        if (wordsResult?.success) {
        }
      }

      setStatus("문장 삭제 중...")
      
      // 해당 문장의 단어 ID Set 만들기
      const sentenceWordIds = new Set(sentence.words.map(w => w.id))
      
      // 삭제할 단어 필터: 해당 문장의 삭제되지 않은 단어들
      const filterFn = (word) => 
        sentenceWordIds.has(word.id) && !word.isDeleted && word.start_at_tick && word.end_at_tick

      const { deletedWordIds, success } = await batchDeleteWords(
        filterFn,
        sentencesRef.current,
        (current, total) => {
          setStatus(`문장 삭제 중... ${current}/${total}`)
        }
      )

      if (success && deletedWordIds.size > 0) {
        // UI 상태 업데이트
        const updated = sentencesRef.current.map((s) => {
          if (s.id !== sentence.id) return s
          return {
            ...s,
            isDeleted: true,
            words: s.words.map((w) => 
              deletedWordIds.has(w.id) ? { ...w, isDeleted: true } : w
            ),
          }
        })
        sentencesRef.current = updated
        setSentences(updated)
        setStatus(`문장 삭제 완료: ${deletedWordIds.size}개 단어`)
      } else {
        setStatus("삭제할 단어가 없습니다")
      }
    } catch (error) {
      console.error("[App] 문장 삭제 실패:", error)
      setStatus("문장 삭제 실패: " + error.message)
    } finally {
      setIsProcessing(false)
    }
  }

  // 문장 복구 핸들러 (백업 히스토리에서 복원하도록 안내)
  const handleRestoreSentence = (sentence) => {
    setStatus("복원은 백업 히스토리에서 해주세요")
  }

  // 백업 히스토리 열기
  const handleOpenHistory = async () => {
    const result = await getBackupList()
    if (result?.success) {
      setBackupList(result.backups || [])
      setShowHistory(true)
    }
  }

  // 백업 시퀀스 열기
  const handleOpenBackup = async (nodeId) => {
    const result = await openBackupSequence(nodeId)
    if (result?.success) {
      setShowHistory(false)
      setStatus(`백업 열림: ${result.name}`)
      loadSequenceInfo()
    }
  }

  // 백업에서 복원
  const handleRestoreBackup = async (backupId) => {
    if (!backupId) return
    if (
      !window.confirm(
        "이 백업으로 복원하시겠습니까?\n현재 시퀀스는 Archive 폴더로 이동됩니다.",
      )
    )
      return

    setStatus("복원 중...")
    const result = await restoreFromBackup(backupId)
    if (result?.success) {
      setShowHistory(false)
      setStatus(`복원 완료: ${result.restoredName}`)
      loadSequenceInfo()

      // 삭제 상태 불러와서 현재 sentences에 반영
      const wordsResult = await loadWordsData(backupId)
      if (wordsResult?.success) {
        const deletedWordSet = new Set(wordsResult.deletedWords || [])
        const deletedSentenceSet = new Set(wordsResult.deletedSentences || [])

        // 현재 sentences 복사 후 삭제 상태 반영
        const updatedSentences = sentencesRef.current.map((sentence) => ({
          ...sentence,
          isDeleted: deletedSentenceSet.has(sentence.id),
          words: sentence.words?.map((word) => ({
            ...word,
            isDeleted: deletedWordSet.has(word.id),
          })),
        }))

        sentencesRef.current = updatedSentences
        setSentences(updatedSentences)
      } else {
        console.warn("[App] 삭제 상태 복원 실패:", wordsResult?.error)
      }
    } else {
      setStatus(`복원 실패: ${result?.error || "알 수 없는 오류"}`)
    }
  }

  // 무음 일괄 삭제
  const handleDeleteSilence = async () => {
    if (isProcessing) return
    setIsProcessing(true)
    setStatus("시퀀스 백업 중...")

    try {
      // 삭제 전 백업
      const backupResult = await backupSequence("무음삭제전")
      if (backupResult?.success) {
        // 단어 데이터도 저장
        const wordsResult = await saveWordsData(
          backupResult.backupId,
          sentencesRef.current,
        )
        if (wordsResult?.success) {
        } else {
          console.warn("[App] 단어 데이터 저장 실패:", wordsResult?.error)
        }
        setStatus(`백업 완료: ${backupResult.backupName}`)
      } else {
        console.warn("[App] 백업 실패:", backupResult?.error)
        setStatus("백업 실패: " + backupResult?.error)
      }

      setStatus("무음 삭제 중...")
      setBatchProgress({ current: 0, total: 0, label: "무음 삭제" })

      const filterFn = (word) =>
        !word.isDeleted && word.edit_points?.type === "silence"

      const { deletedWordIds, success } = await batchDeleteWords(
        filterFn,
        sentencesRef.current,
        (current, total) => {
          setBatchProgress({ current, total, label: "무음 삭제" })
        },
      )

      if (success && deletedWordIds.size > 0) {
        const updated = applyDeleteResult(sentencesRef.current, deletedWordIds)
        sentencesRef.current = updated
        setSentences(updated)
        setStatus(`무음 삭제 완료: ${deletedWordIds.size}개`)
      } else {
        setStatus("삭제할 무음이 없습니다")
      }
    } catch (error) {
      console.error("[App] 무음 삭제 실패:", error)
      setStatus("무음 삭제 실패: " + error.message)
    } finally {
      setIsProcessing(false)
      setBatchProgress(null)
    }
  }

  // 간투사 일괄 삭제
  const handleDeleteFiller = async () => {
    if (isProcessing) return
    setIsProcessing(true)
    setStatus("시퀀스 백업 중...")

    try {
      // 삭제 전 백업
      const backupResult = await backupSequence("간투사삭제전")
      if (backupResult?.success) {
        // 단어 데이터도 저장
        const wordsResult = await saveWordsData(
          backupResult.backupId,
          sentencesRef.current,
        )
        if (wordsResult?.success) {
        } else {
          console.warn("[App] 단어 데이터 저장 실패:", wordsResult?.error)
        }
        setStatus(`백업 완료: ${backupResult.backupName}`)
      } else {
        console.warn("[App] 백업 실패:", backupResult?.error)
        setStatus("백업 실패: " + backupResult?.error)
      }
      setStatus("간투사 삭제 중...")
      setBatchProgress({ current: 0, total: 0, label: "간투사 삭제" })

      const filterFn = (word) =>
        !word.isDeleted &&
        FILLER_TYPES.includes(word.edit_points?.type) &&
        word.start_at_tick &&
        word.end_at_tick // tick 데이터 있는 단어만

      const { deletedWordIds, success } = await batchDeleteWords(
        filterFn,
        sentencesRef.current,
        (current, total) => {
          setBatchProgress({ current, total, label: "간투사 삭제" })
        },
      )

      if (success && deletedWordIds.size > 0) {
        const updated = applyDeleteResult(sentencesRef.current, deletedWordIds)
        sentencesRef.current = updated
        setSentences(updated)
        setStatus(`간투사 삭제 완료: ${deletedWordIds.size}개`)
      } else {
        setStatus("삭제할 간투사가 없습니다")
      }
    } catch (error) {
      console.error("[App] 간투사 삭제 실패:", error)
      setStatus("간투사 삭제 실패: " + error.message)
    } finally {
      setIsProcessing(false)
      setBatchProgress(null)
    }
  }

  // 받아쓰기 완료 콜백 (UXP onFinish 로직 포팅)
  const handleTranscribeFinish = async (taskId) => {
    if (!taskId) return
    setStatus("받아쓰기 결과 가져오는 중...")

    try {
      // API에서 결과 가져오기
      const response = await fetch(`${API_URL}/transcribe/cut/${taskId}`)
      if (!response.ok) {
        console.error("[App] API 응답 오류:", response.status)
        setStatus("결과 가져오기 실패: " + response.status)
        return
      }

      const getSentences = await response.json()

      const sentences = getSentences.data

      // utterances를 sentences 형태로 변환
      const newSentences = sentences.utterances.map((sentence) => {
        const editPoint = sentence.edit_points
        const sentenceId = generateRandomId()

        const newFormWord = sentence.words.flatMap((word) => {
          const wordId = generateRandomId()
          const formattedWord = {
            ...word,
            id: wordId,
            isDeleted: false,
            isHighlight: false,
            parentId: sentenceId,
          }

          // word에 edit_points가 있고 type이 silence면 무음 단어를 앞에 추가
          if (word.edit_points?.type === "silence") {
            const silenceWord = {
              duration: word.edit_points.duration_ms,
              edit_points: {
                type: word.edit_points.type,
                reason: word.edit_points.reason,
              },
              end_at: word.edit_points.end_ms,
              end_time: word.edit_points.end_time,
              start_at: word.edit_points.start_ms,
              start_time: word.edit_points.start_time,
              text: "",
              id: generateRandomId(),
              parentId: sentenceId,
              isEdit: true,
              silence_seconds: word.edit_points.silence_seconds,
              isDeleted: false,
              isHighlight: false,
            }

            // 원래 단어의 edit_points를 빈 객체로 변경
            formattedWord.edit_points = {}

            return [silenceWord, formattedWord]
          }

          return [formattedWord]
        })

        // 문장 앞 무음 단어 (editPoint.reason이 있으면)
        const newWords = editPoint?.reason
          ? [
              {
                duration: editPoint.duration_ms,
                edit_points: { type: editPoint.type, reason: editPoint.reason },
                end_at: editPoint.end_ms,
                end_time: editPoint.end_time,
                start_at: editPoint.start_ms,
                start_time: editPoint.start_time,
                text: "",
                id: generateRandomId(),
                parentId: sentenceId,
                isEdit: true,
                silence_seconds: editPoint.silence_seconds,
                isDeleted: false,
                isHighlight: false,
              },
              ...newFormWord,
            ]
          : newFormWord

        const newSentence = {
          ...sentence,
          id: sentenceId,
          isDeleted: false,
          isHighlight: false,
          words: newWords,
        }

        return newSentence
      })

      // initWords()로 타임라인 정보 추가 (tick, gap 등)
      setStatus("타임라인 정보 처리 중...")
      const gapSentences = await initWords(newSentences)

      setSentences(gapSentences)

      setStatus(`받아쓰기 완료: ${gapSentences.length}개 문장`)
    } catch (e) {
      console.error("[App] 결과 가져오기 실패:", e)
      setStatus("결과 가져오기 실패: " + e.message)
    }
  }

  // 오디오 업로드 훅
  const {
    uploadFile,
    onClickRenderAudio,
    onClickCancel,
    isUpload,
    isError: isUploadError,
  } = useAudioUpload({
    onFinish: handleTranscribeFinish,
    onClose: () => setStatus("취소됨"),
  })

  // 초기 연결 테스트
  useEffect(() => {
    checkConnection()
  }, [])

  // 개발용: taskId로 바로 결과 가져오기
  useEffect(() => {
    const testTaskId = "a6788bc3-7dc0-436f-ab04-96035db57660"
    if (testTaskId && isConnected && sentences.length === 0) {
      handleTranscribeFinish(testTaskId)
    }
  }, [isConnected])

  const checkConnection = async () => {
    try {
      setStatus("ExtendScript 연결 중...")
      const result = await testConnection()

      if (result === "ExtendScript OK") {
        setIsConnected(true)
        setStatus("연결됨")
        loadSequenceInfo()
      } else {
        setError("연결 실패: " + result)
      }
    } catch (e) {
      setError("연결 오류: " + e.message)
    }
  }

  const loadSequenceInfo = async () => {
    try {
      const info = await getActiveSequenceInfo()

      if (info && info.name) {
        setSequenceInfo(info)
        setStatus("시퀀스: " + info.name)
      } else if (info && info.error) {
        setStatus(info.error)
      } else {
        setStatus("시퀀스를 열어주세요")
      }
    } catch (e) {
      console.error("[App] 시퀀스 오류:", e)
      setStatus("시퀀스 정보 조회 실패")
    }
  }

  if (error) {
    return (
      <div className="app-container">
        <div className="status-message error">{error}</div>
        <button
          className="btn"
          onClick={() => {
            setError(null)
            checkConnection()
          }}
        >
          다시 연결
        </button>
      </div>
    )
  }

  return (
    <div className="app-container">
      <div className="header">
        <div className="header-left">
          <h2>videoPlus CEP</h2>
          <button
            className="btn-icon"
            onClick={handleOpenHistory}
            title="백업 히스토리"
          >
            📋
          </button>
        </div>
        <span className={`status ${isConnected ? "connected" : ""}`}>
          {isConnected ? "● 연결됨" : "○ 연결 중..."}
        </span>
      </div>

      <div className="status-bar">{status}</div>

      {sequenceInfo && (
        <div className="seq-info">
          <span>{sequenceInfo.name}</span>
        </div>
      )}

      {/* 업로드 진행 상태 */}
      {isUpload && uploadFile && (
        <div className="upload-progress">
          <div className="progress-info">
            <span>{uploadFile.message}</span>
            {uploadFile.progress > 0 && (
              <span className="progress-percent">{uploadFile.progress}%</span>
            )}
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${uploadFile.progress || 0}%` }}
            />
          </div>
          <button className="btn cancel" onClick={onClickCancel}>
            취소
          </button>
        </div>
      )}

      {/* 배치 작업 진행 상태 */}
      {batchProgress && (
        <div className="batch-progress">
          <div className="progress-info">
            <span>{batchProgress.label}</span>
            <span className="progress-count">
              {batchProgress.current} / {batchProgress.total} 단어
            </span>
            {batchProgress.total > 0 && (
              <span className="progress-percent">
                {Math.round(
                  (batchProgress.current / batchProgress.total) * 100,
                )}
                %
              </span>
            )}
          </div>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{
                width:
                  batchProgress.total > 0
                    ? `${(batchProgress.current / batchProgress.total) * 100}%`
                    : "0%",
              }}
            />
          </div>
        </div>
      )}

      <div className="actions">
        <button className="btn" onClick={loadSequenceInfo}>
          🔄 새로고침
        </button>
        <button
          className="btn primary"
          disabled={!isConnected || isUpload}
          onClick={onClickRenderAudio}
        >
          {isUpload ? "받아쓰는 중..." : "받아쓰기"}
        </button>
        <button
          className="btn"
          disabled={
            !isConnected || isUpload || isProcessing || sentences.length === 0
          }
          onClick={handleDeleteSilence}
        >
          무음 삭제
        </button>
        <button
          className="btn"
          disabled={
            !isConnected || isUpload || isProcessing || sentences.length === 0
          }
          onClick={handleDeleteFiller}
        >
          간투사 삭제
        </button>
      </div>

      <div className="sentence-list">
        {sentences.length > 0 ? (
          sentences.map((sentence) => (
            <Sentence
              key={sentence.id}
              sentence={sentence}
              sentences={sentences}
              currentWordId={currentWordId}
              onWordClick={handleWordClick}
              onWordContextMenu={handleWordContextMenu}
              onDeleteSentence={handleDeleteSentence}
              onRestoreSentence={handleRestoreSentence}
              searchResultsSet={searchResultsSet}
              currentSearchWordId={currentSearchWordId}
              wordRefs={wordRefs}
            />
          ))
        ) : (
          <p className="placeholder">소스클립을 받아쓰지 않았습니다</p>
        )}
      </div>

      {/* 컨텍스트 메뉴 */}
      {contextMenu && (
        <ContextMenu
          position={contextMenu.position}
          word={contextMenu.word}
          onDelete={handleDeleteWord}
          onRestore={handleRestoreWord}
          onClose={handleCloseContextMenu}
          onMark={handleMark}
        />
      )}

      {/* 백업 히스토리 모달 */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>백업 히스토리</h3>
              <button
                className="btn-close"
                onClick={() => setShowHistory(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {backupList.length > 0 ? (
                <ul className="backup-list">
                  {backupList.map((backup, idx) => (
                    <li
                      key={backup.backupId || idx}
                      onClick={() => handleRestoreBackup(backup.backupId)}
                      className="backup-item"
                    >
                      📁 {backup.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="no-backups">백업이 없습니다</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
