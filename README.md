# SillyTavern-ChatEyeSwitch

A small SillyTavern UI extension for bulk-applying the native message "Exclude from prompts" state.

## Features

- Hide chat floors from prompts in bulk.
- Optionally keep a 1-based floor range visible, such as floors 3 to 8.
- Show every hidden floor again in one click.
- Restore the last bulk hide operation without touching messages that were already hidden before the operation.
- The send box hamburger menu opens a compact settings dialog, with the same controls also available in the Extensions panel.

## Notes

This extension uses the same chat state as SillyTavern's native eye button: `is_system = true`.
It does not delete messages or edit message text.
