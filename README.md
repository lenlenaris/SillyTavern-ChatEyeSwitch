# SillyTavern-ChatEyeSwitch

A small SillyTavern UI extension for bulk-applying the native message "Exclude from prompts" state.

## Features

- Exclude a selected SillyTavern message range from the prompt in bulk.
- Include a selected message range in the prompt again.
- Leave the range empty to apply the action to every chat message.
- Restore the last bulk exclude/include operation without touching messages changed before that operation.
- The magic wand Extensions menu opens the settings dialog.
- Uses English by default and switches to Chinese when SillyTavern is set to Chinese or Traditional Chinese.

## Notes

This extension uses the same chat state as SillyTavern's native eye button: `is_system = true`.
It does not delete messages or edit message text.
