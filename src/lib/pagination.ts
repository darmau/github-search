/** Number of pages that can actually be fetched, never less than 1 */
export function getTotalPages(totalCount: number, pageSize: number, maxResults = Infinity): number {
  return Math.max(1, Math.ceil(Math.min(totalCount, maxResults) / pageSize))
}
