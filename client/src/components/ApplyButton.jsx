import React from "react"
import { Scissors } from "lucide-react"
import { Button } from "./ui/button"

export default function ApplyButton({ selectedWordIds, onApply, isProcessing, isConnected, isUpload }) {
  return (
    <div className="flex justify-end mt-2">
      <Button
        variant={selectedWordIds.size > 0 ? "default" : "secondary"}
        size="sm"
        disabled={
          selectedWordIds.size === 0 ||
          !isConnected ||
          isUpload ||
          isProcessing
        }
        onClick={onApply}
      >
        <Scissors className="h-4 w-4 mr-2" />
        시퀀스에 적용{" "}
        {selectedWordIds.size > 0 && `(${selectedWordIds.size})`}
      </Button>
    </div>
  )
}
