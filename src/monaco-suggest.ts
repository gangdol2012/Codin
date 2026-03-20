import * as monaco from 'monaco-editor';

const configuredEditors = new WeakSet<monaco.editor.IStandaloneCodeEditor>();

export function configureMonacoSuggestionAcceptance(editor: monaco.editor.IStandaloneCodeEditor) {
  editor.updateOptions({
    quickSuggestions: {
      other: true,
      comments: false,
      strings: true,
    },
    quickSuggestionsDelay: 10,
    suggestOnTriggerCharacters: true,
    tabCompletion: 'off',
    acceptSuggestionOnEnter: 'on',
    acceptSuggestionOnCommitCharacter: true,
    snippetSuggestions: 'inline',
    suggestSelection: 'first',
    parameterHints: {
      enabled: true,
      cycle: true,
    },
    inlineSuggest: {
      enabled: true,
    },
  });

  if (configuredEditors.has(editor)) {
    return;
  }

  editor.addCommand(
    monaco.KeyCode.Enter,
    () => editor.trigger('monaco-suggest', 'acceptSelectedSuggestion', undefined),
    'suggestWidgetVisible && suggestWidgetHasFocusedSuggestion && textInputFocus'
  );

  editor.addCommand(
    monaco.KeyCode.Tab,
    () => editor.trigger('monaco-suggest', 'acceptSelectedSuggestion', undefined),
    'suggestWidgetVisible && suggestWidgetHasFocusedSuggestion && textInputFocus'
  );

  configuredEditors.add(editor);
}
