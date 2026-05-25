'use client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  contentId: string
  onExtract: (text: string) => void
  onSaveAsNote: (text: string) => void
  onCreateFlashcard: (text: string) => void
  onDeletePassage: (text: string) => void
}

interface Position {
  top: number
  left: number
}

export function SelectionToolbar({
  contentId,
  onExtract,
  onSaveAsNote,
  onCreateFlashcard,
  onDeletePassage,
}: Props) {
  const [selectedText, setSelectedText] = useState('')
  const [position, setPosition] = useState<Position | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleSelectionChange() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setSelectedText('')
        setPosition(null)
        return
      }

      const contentEl = document.getElementById(contentId)
      if (!contentEl) return
      const range = sel.getRangeAt(0)
      if (!contentEl.contains(range.commonAncestorContainer)) {
        setSelectedText('')
        setPosition(null)
        return
      }

      const rect = range.getBoundingClientRect()
      setSelectedText(sel.toString().trim())
      setPosition({
        top: rect.top + window.scrollY - 48,
        left: rect.left + rect.width / 2,
      })
    }

    document.addEventListener('mouseup', handleSelectionChange)
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('mouseup', handleSelectionChange)
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [contentId])

  function dismissSelection() {
    window.getSelection()?.removeAllRanges()
    setSelectedText('')
    setPosition(null)
  }

  if (!position || !selectedText) return null

  return (
    <div
      ref={toolbarRef}
      style={{
        position: 'absolute',
        top: position.top,
        left: position.left,
        transform: 'translateX(-50%)',
      }}
      className="z-50 flex gap-1 rounded-lg border bg-popover p-1 shadow-lg"
      onMouseDown={e => e.preventDefault()}
    >
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={() => {
          onExtract(selectedText)
          dismissSelection()
        }}
      >
        Extract
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={() => {
          onSaveAsNote(selectedText)
          dismissSelection()
        }}
      >
        Save as Note
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        onClick={() => {
          onCreateFlashcard(selectedText)
          dismissSelection()
        }}
      >
        Flashcard
      </Button>
      <Button
        size="sm"
        variant="destructive"
        className="h-7 px-2 text-xs"
        aria-label="Delete passage"
        onClick={() => {
          onDeletePassage(selectedText)
          dismissSelection()
        }}
      >
        Delete passage
      </Button>
    </div>
  )
}
