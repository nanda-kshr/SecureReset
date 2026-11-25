'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Skeleton } from './Skeleton'

export type SortDirection = 'asc' | 'desc'

export interface DataTableColumn<T> {
  key: string
  header: string
  sortable?: boolean
  sortValue?: (row: T) => string | number
  align?: 'left' | 'right'
  className?: string
  render: (row: T) => React.ReactNode
}

export interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>
  data: T[]
  getRowKey: (row: T, index: number) => string
  onRowClick?: (row: T) => void
  initialSortKey?: string
  initialSortDirection?: SortDirection
  loading?: boolean
  loadingRows?: number
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
  caption?: string
  className?: string
}

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  onRowClick,
  initialSortKey,
  initialSortDirection = 'desc',
  loading = false,
  loadingRows = 4,
  emptyTitle = 'No records found',
  emptyDescription = 'There is nothing to display for the current filters.',
  emptyAction,
  caption,
  className = '',
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(initialSortKey || null)
  const [sortDir, setSortDir] = useState<SortDirection>(initialSortDirection)

  const sortedData = useMemo(() => {
    if (!sortKey) return data
    const col = columns.find((c) => c.key === sortKey)
    if (!col || !col.sortable) return data

    const getVal = col.sortValue || ((row: T) => String((row as Record<string, unknown>)[col.key] ?? ''))
    return [...data].sort((a, b) => {
      const va = getVal(a)
      const vb = getVal(b)
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortDir === 'asc' ? va - vb : vb - va
      }
      const cmp = String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, columns, sortKey, sortDir])

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return (
    <div
      className={`rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden ${className}`}
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead className="bg-[var(--bg-surface-subtle)] border-b border-[var(--border-subtle)] text-xs font-semibold text-[var(--text-secondary)]">
            <tr>
              {columns.map((col) => {
                const isSorted = sortKey === col.key
                const ariaSort = col.sortable
                  ? isSorted
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                  : undefined

                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={`py-3 px-4 whitespace-nowrap ${
                      col.align === 'right' ? 'text-right' : 'text-left'
                    } ${col.className || ''}`}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="sr-transition inline-flex items-center gap-1.5 font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                      >
                        <span>{col.header}</span>
                        {isSorted ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--border-subtle)]">
            {loading &&
              Array.from({ length: loadingRows }).map((_, rIdx) => (
                <tr key={`skeleton-${rIdx}`}>
                  {columns.map((col) => (
                    <td key={col.key} className="py-3.5 px-4">
                      <Skeleton className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && sortedData.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-10 px-6 text-center">
                  <div className="max-w-sm mx-auto space-y-1.5">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">
                      {emptyTitle}
                    </div>
                    <p className="text-xs text-[var(--text-muted)] leading-normal">
                      {emptyDescription}
                    </p>
                    {emptyAction && <div className="pt-2">{emptyAction}</div>}
                  </div>
                </td>
              </tr>
            )}

            {!loading &&
              sortedData.map((row, idx) => (
                <tr
                  key={getRowKey(row, idx)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onRowClick(row)
                          }
                        }
                      : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  className={`sr-transition ${
                    onRowClick
                      ? 'cursor-pointer hover:bg-[var(--bg-surface-subtle)] focus-visible:bg-[var(--bg-surface-subtle)]'
                      : ''
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-3 px-4 text-sm text-[var(--text-primary)] ${
                        col.align === 'right' ? 'text-right' : 'text-left'
                      } ${col.className || ''}`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
