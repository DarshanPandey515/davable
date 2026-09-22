import React, { createContext, forwardRef, useCallback, useContext, useEffect, useState } from 'react'
import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { FileIcon, FolderIcon, FolderOpenIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const TreeContext = createContext(null)

function useTree() {
  const context = useContext(TreeContext)
  if (!context) throw new Error('useTree must be used within a Tree')
  return context
}

const isFolderElement = (element) =>
  element.type ? element.type === 'folder' : Array.isArray(element.children)

function renderTreeElements(elements) {
  return elements.map((element) =>
    isFolderElement(element) ? (
      <Folder key={element.id} value={element.id} element={element.name} isSelectable={element.isSelectable}>
        {Array.isArray(element.children) ? renderTreeElements(element.children) : null}
      </Folder>
    ) : (
      <File key={element.id} value={element.id} isSelectable={element.isSelectable}>
        <span className="truncate">{element.name}</span>
      </File>
    ),
  )
}

export function Tree({
  className,
  elements,
  initialSelectedId,
  initialExpandedItems,
  children,
  indicator = true,
  openIcon,
  closeIcon,
  onSelect,
  ...props
}) {
  const [selectedId, setSelectedId] = useState(initialSelectedId)
  const [expandedItems, setExpandedItems] = useState(initialExpandedItems)

  const selectItem = useCallback(
    (id) => {
      setSelectedId(id)
      onSelect?.(id)
    },
    [onSelect],
  )

  const handleExpand = useCallback((id) => {
    setExpandedItems((prev) =>
      prev?.includes(id) ? prev.filter((item) => item !== id) : [...(prev ?? []), id],
    )
  }, [])

  const expandToSelected = useCallback((nodes, selectId) => {
    if (!nodes || !selectId) return
    const walk = (items, path) => {
      for (const node of items) {
        const nextPath = [...path, node.id]
        if (node.id === selectId) {
          setExpandedItems((prev) => [...new Set([...(prev ?? []), ...nextPath])])
          return true
        }
        if (Array.isArray(node.children) && walk(node.children, nextPath)) return true
      }
      return false
    }
    walk(nodes, [])
  }, [])

  useEffect(() => {
    if (initialSelectedId) expandToSelected(elements, initialSelectedId)
  }, [initialSelectedId, elements, expandToSelected])

  const treeChildren = children ?? (elements ? renderTreeElements(elements) : null)

  return (
    <TreeContext.Provider
      value={{ selectedId, expandedItems, handleExpand, selectItem, setExpandedItems, indicator, openIcon, closeIcon }}
    >
      <div className={cn('size-full', className)}>
        <AccordionPrimitive.Root
          {...props}
          type="multiple"
          value={expandedItems}
          className="flex flex-col gap-0.5"
        >
          {treeChildren}
        </AccordionPrimitive.Root>
      </div>
    </TreeContext.Provider>
  )
}

export function Folder({ className, element, value, isSelectable = true, isSelect, children, ...props }) {
  const { handleExpand, expandedItems, indicator, selectedId, selectItem, openIcon, closeIcon } = useTree()
  const isSelected = isSelect ?? selectedId === value

  return (
    <AccordionPrimitive.Item {...props} value={value} className="relative">
      <AccordionPrimitive.Trigger
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-ink-soft outline-none transition-colors',
          'hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink',
          isSelected && isSelectable && 'bg-surface-muted text-ink',
          isSelectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
          className,
        )}
        disabled={!isSelectable}
        onClick={() => {
          selectItem(value)
          handleExpand(value)
        }}
      >
        {expandedItems?.includes(value)
          ? (openIcon ?? <FolderOpenIcon className="size-3.5 shrink-0 text-ink-muted" />)
          : (closeIcon ?? <FolderIcon className="size-3.5 shrink-0 text-ink-muted" />)}
        <span className="truncate font-medium">{element}</span>
      </AccordionPrimitive.Trigger>
      <AccordionPrimitive.Content className="relative overflow-hidden data-[state=closed]:hidden">
        {element && indicator ? (
          <span aria-hidden className="absolute top-0 left-2.5 h-full w-px bg-line-strong" />
        ) : null}
        <AccordionPrimitive.Root type="multiple" className="ml-4 flex flex-col gap-0.5 py-0.5" value={expandedItems}>
          {children}
        </AccordionPrimitive.Root>
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  )
}

export const File = forwardRef(function File(
  { value, className, handleSelect, onClick, isSelectable = true, isSelect, fileIcon, children, ...props },
  ref,
) {
  const { selectedId, selectItem } = useTree()
  const isSelected = isSelect ?? selectedId === value

  return (
    <button
      ref={ref}
      type="button"
      disabled={!isSelectable}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-none transition-colors',
        'hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink',
        isSelected && isSelectable && 'bg-surface-muted font-medium text-ink',
        isSelectable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
        className,
      )}
      onClick={(event) => {
        selectItem(value)
        handleSelect?.(value)
        onClick?.(event)
      }}
      {...props}
    >
      {fileIcon ?? <FileIcon className="size-3.5 shrink-0 text-ink-faint" />}
      {children}
    </button>
  )
})
