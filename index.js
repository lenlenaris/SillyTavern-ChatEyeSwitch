const MODULE_NAME = 'bulk_prompt_exclude';
const METADATA_KEY = `${MODULE_NAME}.lastRun`;
const DEFAULT_SETTINGS = Object.freeze({
    keepStart: '',
    keepEnd: '',
});

function getContext() {
    return SillyTavern.getContext();
}

function getSettings() {
    const context = getContext();

    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }

    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (!Object.hasOwn(context.extensionSettings[MODULE_NAME], key)) {
            context.extensionSettings[MODULE_NAME][key] = DEFAULT_SETTINGS[key];
        }
    }

    return context.extensionSettings[MODULE_NAME];
}

function getCurrentChatMetadata() {
    return getContext().chatMetadata;
}

function getLastRun() {
    return getCurrentChatMetadata()[METADATA_KEY] ?? null;
}

function setLastRun(value) {
    getCurrentChatMetadata()[METADATA_KEY] = value;
}

function parseOptionalFloor(value) {
    const text = String(value ?? '').trim();

    if (!text) {
        return null;
    }

    const number = Number.parseInt(text, 10);
    return Number.isFinite(number) && number > 0 ? number : null;
}

function escapeAttribute(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function getKeepRange() {
    const settings = getSettings();
    const start = parseOptionalFloor(settings.keepStart);
    const end = parseOptionalFloor(settings.keepEnd);

    if (start === null && end === null) {
        return null;
    }

    const rawStart = start ?? end;
    const rawEnd = end ?? start;

    return {
        start: Math.min(rawStart, rawEnd),
        end: Math.max(rawStart, rawEnd),
    };
}

function isKeptMessage(messageIndex, keepRange) {
    if (!keepRange) {
        return false;
    }

    const floor = messageIndex + 1;
    return floor >= keepRange.start && floor <= keepRange.end;
}

function refreshVisibleMessage(messageId, isHidden) {
    $(`.mes[mesid="${messageId}"]`).attr('is_system', String(isHidden));
}

function refreshSwipeButtons() {
    const context = getContext();

    if (context.swipe?.refresh) {
        context.swipe.refresh();
    }
}

async function saveChatAndMetadata() {
    const context = getContext();
    await context.saveChat();

    if (typeof context.saveMetadata === 'function') {
        await context.saveMetadata();
    }
}

async function importNativeHideRange() {
    try {
        const module = await import('/scripts/chats.js');
        return typeof module.hideChatMessageRange === 'function'
            ? module.hideChatMessageRange
            : null;
    } catch (error) {
        console.warn('[Bulk Prompt Exclude] Could not import native hideChatMessageRange.', error);
        return null;
    }
}

function getTargetRanges(chatLength, keepRange) {
    if (!keepRange) {
        return [[0, chatLength - 1]];
    }

    const rawKeepStartIndex = keepRange.start - 1;
    const rawKeepEndIndex = keepRange.end - 1;

    if (rawKeepEndIndex < 0 || rawKeepStartIndex > chatLength - 1) {
        return [[0, chatLength - 1]];
    }

    const keepStartIndex = Math.max(0, rawKeepStartIndex);
    const keepEndIndex = Math.min(chatLength - 1, rawKeepEndIndex);
    const ranges = [];

    if (keepStartIndex > 0) {
        ranges.push([0, keepStartIndex - 1]);
    }

    if (keepEndIndex < chatLength - 1) {
        ranges.push([keepEndIndex + 1, chatLength - 1]);
    }

    return ranges.filter(([start, end]) => start <= end);
}

async function hideTargetMessages(chatLength, keepRange, changed) {
    const context = getContext();
    const nativeHideRange = await importNativeHideRange();

    if (nativeHideRange) {
        for (const [start, end] of getTargetRanges(chatLength, keepRange)) {
            await nativeHideRange(start, end, false);
        }
        return;
    }

    for (const item of changed) {
        const message = context.chat[item.id];
        message.is_system = true;
        refreshVisibleMessage(item.id, true);
    }

    refreshSwipeButtons();
    await context.saveChat();
}

async function excludeAllExceptRange() {
    const context = getContext();
    const chat = context.chat ?? [];

    if (!chat.length) {
        toastr.info('目前沒有可處理的聊天樓層。');
        return;
    }

    const keepRange = getKeepRange();
    const changed = [];

    for (let messageId = 0; messageId < chat.length; messageId++) {
        if (isKeptMessage(messageId, keepRange)) {
            continue;
        }

        const message = chat[messageId];

        if (!message || message.is_system === true) {
            continue;
        }

        changed.push({
            id: messageId,
            previous: Boolean(message.is_system),
        });
    }

    if (!changed.length) {
        updateStatus();
        toastr.info('沒有新的樓層需要排除。');
        return;
    }

    await hideTargetMessages(chat.length, keepRange, changed);

    setLastRun({
        changed,
        keepRange,
        chatLength: chat.length,
        createdAt: Date.now(),
    });
    await context.saveMetadata();
    updateStatus();

    const keptText = keepRange ? `，保留第 ${keepRange.start}～${keepRange.end} 樓` : '';
    toastr.success(`已排除 ${changed.length} 樓${keptText}。`);
}

async function restoreLastRun() {
    const context = getContext();
    const chat = context.chat ?? [];
    const lastRun = getLastRun();
    const changed = Array.isArray(lastRun?.changed) ? lastRun.changed : [];

    if (!changed.length) {
        toastr.info('沒有可恢復的上次批量操作。');
        return;
    }

    let restoredCount = 0;

    for (const item of changed) {
        const messageId = Number(item.id);
        const message = chat[messageId];

        if (!message) {
            continue;
        }

        const previous = Boolean(item.previous);

        if (message.is_system === previous) {
            continue;
        }

        message.is_system = previous;
        refreshVisibleMessage(messageId, previous);
        restoredCount++;
    }

    refreshSwipeButtons();
    delete getCurrentChatMetadata()[METADATA_KEY];
    await saveChatAndMetadata();
    updateStatus();
    toastr.success(`已恢復 ${restoredCount} 樓。`);
}

function persistInputs() {
    const input = $(this);
    const field = input.data('bpeField');

    if (!field) {
        return;
    }

    const settings = getSettings();
    settings[field] = String(input.val() ?? '');

    $(`[data-bpe-field="${field}"]`).not(input).val(settings[field]);
    getContext().saveSettingsDebounced();
}

function updateStatus() {
    const context = getContext();
    const chat = context.chat ?? [];
    const hiddenCount = chat.filter(message => message?.is_system === true).length;
    const lastRun = getLastRun();
    const changedCount = Array.isArray(lastRun?.changed) ? lastRun.changed.length : 0;

    $('.bulk_prompt_exclude_status').text(`${hiddenCount}/${chat.length} 樓已排除`);
    $('[data-bpe-action="restore"]').prop('disabled', changedCount === 0).toggleClass('disabled', changedCount === 0);
}

function renderControlsContent(compact = false) {
    const settings = getSettings();
    const keepStart = escapeAttribute(settings.keepStart);
    const keepEnd = escapeAttribute(settings.keepEnd);
    const compactClass = compact ? ' bulk-prompt-exclude__content--compact' : '';

    return `
        <div class="bulk-prompt-exclude__content${compactClass}">
            <div class="bulk-prompt-exclude__row">
                <label>不排除起始樓</label>
                <input class="text_pole" data-bpe-field="keepStart" type="number" min="1" step="1" inputmode="numeric" value="${keepStart}">
            </div>
            <div class="bulk-prompt-exclude__row">
                <label>不排除結束樓</label>
                <input class="text_pole" data-bpe-field="keepEnd" type="number" min="1" step="1" inputmode="numeric" value="${keepEnd}">
            </div>
            <div class="bulk-prompt-exclude__actions">
                <button class="menu_button" data-bpe-action="apply" type="button">
                    <i class="fa-solid fa-eye-slash"></i>
                    <span>排除全部</span>
                </button>
                <button class="menu_button" data-bpe-action="restore" type="button">
                    <i class="fa-solid fa-rotate-left"></i>
                    <span>恢復上次</span>
                </button>
            </div>
            <small class="bulk_prompt_exclude_status"></small>
        </div>
    `;
}

function bindControls(root) {
    root.find('[data-bpe-field]').off('input.bulkPromptExclude').on('input.bulkPromptExclude', persistInputs);
    root.find('[data-bpe-field], [data-bpe-action]')
        .off('click.bulkPromptExclude')
        .on('click.bulkPromptExclude', event => event.stopPropagation());
    root.find('[data-bpe-action="apply"]').off('click.bulkPromptExcludeAction').on('click.bulkPromptExcludeAction', async event => {
        event.preventDefault();
        event.stopPropagation();
        await excludeAllExceptRange();
    });
    root.find('[data-bpe-action="restore"]').off('click.bulkPromptExcludeAction').on('click.bulkPromptExcludeAction', async event => {
        event.preventDefault();
        event.stopPropagation();
        await restoreLastRun();
    });
}

function renderSettings() {
    if ($('#bulk_prompt_exclude_settings').length) {
        updateStatus();
        return;
    }

    const html = `
        <div id="bulk_prompt_exclude_settings" class="bulk-prompt-exclude">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Bulk Prompt Exclude</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">${renderControlsContent()}</div>
            </div>
        </div>
    `;

    $('#extensions_settings2').append(html);
    bindControls($('#bulk_prompt_exclude_settings'));
    updateStatus();
}

function renderOptionsMenuControls() {
    const menu = $('#options .options-content');

    if (!menu.length || $('#bulk_prompt_exclude_options').length) {
        updateStatus();
        return;
    }

    const html = `
        <div id="bulk_prompt_exclude_options" class="bulk-prompt-exclude bulk-prompt-exclude--options">
            <hr>
            <div class="bulk-prompt-exclude__title">
                <i class="fa-lg fa-solid fa-eye-slash"></i>
                <span>批量排除樓層</span>
            </div>
            ${renderControlsContent(true)}
            <hr>
        </div>
    `;

    const advancedAnchor = menu.find('#options_advanced');

    if (advancedAnchor.length) {
        advancedAnchor.before(html);
    } else {
        const firstDivider = menu.find('hr').first();

        if (firstDivider.length) {
            firstDivider.before(html);
        } else {
            menu.prepend(html);
        }
    }

    bindControls($('#bulk_prompt_exclude_options'));
    updateStatus();
}

jQuery(async () => {
    const context = getContext();
    const eventTypes = context.eventTypes ?? context.event_types;
    renderSettings();
    renderOptionsMenuControls();

    context.eventSource.on(eventTypes.APP_READY, renderOptionsMenuControls);
    context.eventSource.on(eventTypes.CHAT_CHANGED, updateStatus);
    context.eventSource.on(eventTypes.MESSAGE_SENT, updateStatus);
    context.eventSource.on(eventTypes.MESSAGE_RECEIVED, updateStatus);
    context.eventSource.on(eventTypes.MESSAGE_DELETED, updateStatus);
});
