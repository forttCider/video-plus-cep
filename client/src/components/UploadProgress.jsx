import React from "react"
import { Button } from "./ui/button"
import { Card, CardContent } from "./ui/card"
import { Progress } from "./ui/progress"

export default function UploadProgress({ isUpload, uploadFile, onCancel }) {
  if (!isUpload || !uploadFile) return null

  return (
    <Card className="mb-3">
      <CardContent className="py-3 px-3">
        <div className="flex justify-between mb-2 text-sm">
          <span>{uploadFile.message}</span>
          {uploadFile.progress > 0 && (
            <span className="text-primary">{uploadFile.progress}%</span>
          )}
        </div>
        <Progress value={uploadFile.progress || 0} className="mb-3" />
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={onCancel}
        >
          취소
        </Button>
      </CardContent>
    </Card>
  )
}
