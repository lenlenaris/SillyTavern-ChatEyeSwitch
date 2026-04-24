# SillyTavern-ChatEyeSwitch

A small SillyTavern UI extension for bulk-applying the native message "Exclude from prompts" state.

## Features

- Exclude all chat messages from prompts in one click.
- Optionally keep a 1-based floor range visible, such as floors 3 to 8.
- Restore the last bulk operation without touching messages that were already hidden before the operation.
- Controls are added to the send box hamburger menu, with the same controls mirrored in the Extensions panel.

## Install

Put this folder in either:

- `SillyTavern/data/<user-handle>/extensions/SillyTavern-ChatEyeSwitch`
- `SillyTavern/public/scripts/extensions/third-party/SillyTavern-ChatEyeSwitch`

Then enable **Chat Eye Switch** from SillyTavern's extensions panel.

## Notes

This extension uses the same chat state as SillyTavern's native eye button: `is_system = true`.
It does not delete messages or edit message text.
