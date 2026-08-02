export interface RuntimeBoundCompletionResolveState {
  runtimeSession: number;
}

export interface CompletionResolveSnapshotIdentity {
  modelVersionId: number;
  structuralVersion: number;
}

export type CompletionResolveSnapshotMode = 'current' | 'rebase' | 'invalid';

export interface CompletionResolveLiveContext<TLateContext> {
  valid: boolean;
  lateContext: TLateContext | null;
}

export interface CompletionOffsetRange {
  start: number;
  end: number;
}

/**
 * Text typed into the currently presented identifier can be rebased, but a project,
 * model, or configuration transition invalidates the semantic meaning of the old item
 * even when Monaco happens to retain the same numeric model version.
 */
export function completionResolveSnapshotMode(
  snapshot: CompletionResolveSnapshotIdentity | undefined,
  currentModelVersionId: number,
  currentStructuralVersion: number
): CompletionResolveSnapshotMode {
  if (!snapshot) return 'current';
  if (snapshot.structuralVersion !== currentStructuralVersion) return 'invalid';
  return snapshot.modelVersionId === currentModelVersionId ? 'current' : 'rebase';
}

/**
 * Monaco may accept the main completion while resolve is still pending and then apply
 * additional edits from the resolved item. The original details token can be cancelled
 * as the widget closes, but the context validated immediately before dispatch remains
 * the correct coordinate space when the main edit proves that item was accepted.
 */
export function selectCompletionResolveContext<TLateContext>(
  dispatchContext: CompletionResolveLiveContext<TLateContext>,
  liveContext: CompletionResolveLiveContext<TLateContext>,
  cancelled: boolean,
  acceptedAfterDispatch: boolean,
  dispatchStructuralVersion: number,
  currentStructuralVersion: number
): CompletionResolveLiveContext<TLateContext> | null {
  if (
    dispatchStructuralVersion !== currentStructuralVersion ||
    !dispatchContext.valid
  ) {
    return null;
  }
  if (liveContext.valid) return cancelled ? null : liveContext;
  // A focus/details resolve can be reused by Monaco's accept transaction. Accepting
  // closes the widget and cancels the first token even though that same response is now
  // responsible for supplying the accepted item's additional edits.
  return acceptedAfterDispatch ? dispatchContext : null;
}

export function isCompletionAcceptedText(
  dispatchText: string,
  currentText: string,
  insertText: string,
  candidateRanges: readonly CompletionOffsetRange[]
): boolean {
  return candidateRanges.some(range => {
    if (
      range.start < 0 ||
      range.end < range.start ||
      range.end > dispatchText.length
    ) {
      return false;
    }
    const expectedPrefix = dispatchText.slice(0, range.start) + insertText;
    const expectedSuffix = dispatchText.slice(range.end);
    return (
      currentText.length >= expectedPrefix.length + expectedSuffix.length &&
      currentText.startsWith(expectedPrefix) &&
      currentText.endsWith(expectedSuffix)
    );
  });
}

export function mapCompletionSnapshotOffsetRange(
  startOffset: number,
  endOffset: number,
  insertionOffset: number,
  insertedLength: number,
  currentTextLength: number,
  mode: 'main' | 'edit'
): CompletionOffsetRange | null {
  if (
    !Number.isSafeInteger(startOffset) ||
    !Number.isSafeInteger(endOffset) ||
    !Number.isSafeInteger(insertionOffset) ||
    !Number.isSafeInteger(insertedLength) ||
    !Number.isSafeInteger(currentTextLength) ||
    startOffset < 0 ||
    endOffset < startOffset ||
    insertionOffset < 0 ||
    insertedLength < 0 ||
    currentTextLength < 0
  ) {
    return null;
  }

  const mapStart = (offset: number) =>
    offset < insertionOffset ? offset : offset + insertedLength;
  const mapEnd = (offset: number) => {
    if (offset < insertionOffset) return offset;
    if (mode === 'main' && offset === insertionOffset) {
      return offset + insertedLength;
    }
    return offset + insertedLength;
  };
  const mappedStart =
    mode === 'main' && startOffset <= insertionOffset
      ? startOffset
      : mapStart(startOffset);
  const mappedEnd = mapEnd(endOffset);
  if (mappedStart > mappedEnd || mappedEnd > currentTextLength) return null;
  return { start: mappedStart, end: mappedEnd };
}

/**
 * Resolve data is tied to a presented completion item and one worker generation.
 * A WeakMap keeps it alive for Monaco's visible item without turning cache eviction or
 * ordinary typing into a correctness event.
 */
export class CompletionResolveStateStore<
  TItem extends object,
  TState extends RuntimeBoundCompletionResolveState,
> {
  private states = new WeakMap<TItem, TState>();

  set(item: TItem, state: TState): void {
    this.states.set(item, state);
  }

  get(item: TItem, runtimeSession: number): TState | undefined {
    const state = this.states.get(item);
    return state?.runtimeSession === runtimeSession ? state : undefined;
  }

  reset(): void {
    this.states = new WeakMap<TItem, TState>();
  }
}
