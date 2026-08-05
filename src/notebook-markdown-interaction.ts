export function resolveEditingMarkdownCellAfterClick(
  editingCellId: string | null,
  clickedEditorCellId: string | null
) {
  return editingCellId && editingCellId !== clickedEditorCellId
    ? null
    : editingCellId;
}
