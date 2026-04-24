# SillyTavern-ChatEyeSwitch

A small SillyTavern UI extension for bulk-applying the native message "Exclude from prompts" state.

## Features

- Exclude a selected SillyTavern floor range from prompts in bulk.
- Include a selected floor range in prompts again.
- Leave the range empty to apply the action to every chat floor.
- Restore the last bulk exclude/include operation without touching messages changed before that operation.
- The send box hamburger menu opens the settings dialog; the Extensions panel only shows whether the extension is enabled.
- Uses English by default and switches to Chinese when SillyTavern is set to Chinese or Traditional Chinese.

## Notes

This extension uses the same chat state as SillyTavern's native eye button: `is_system = true`.
It does not delete messages or edit message text.
