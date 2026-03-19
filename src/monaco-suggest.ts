import * as monaco from 'monaco-editor';

const configuredEditors = new WeakSet<monaco.editor.IStandaloneCodeEditor>();

export function configureMonacoSuggestionAcceptance(editor: monaco.editor.IStandaloneCodeEditor) {
  if (configuredEditors.has(editor)) {
    return;
  }

  editor.updateOptions({
    acceptSuggestionOnEnter: 'on',
    acceptSuggestionOnCommitCharacter: true,
  });

  editor.addCommand(
    monaco.KeyCode.Enter,
    () => editor.trigger('monaco-suggest', 'acceptSelectedSuggestion', undefined),
    'suggestWidgetVisible && suggestWidgetHasFocusedSuggestion && textInputFocus'
  );

  configuredEditors.add(editor);
}
