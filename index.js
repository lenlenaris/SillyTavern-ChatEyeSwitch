const MODULE_NAME = 'bulk_prompt_exclude';
const DISPLAY_NAME = 'Chat Eye Switch';
const METADATA_KEY = `${MODULE_NAME}.lastRun`;
const DEFAULT_SETTINGS = Object.freeze({
    keepStart: '',
    keepEnd: '',
});
const TEXT = Object.freeze({
    en: {
        close: 'Close',
        dialogTitle: 'Batch prompt status',
        clearRange: 'Clear range',
        excludeAction: 'Exclude from prompts',
        excluded: 'Excluded {count} floor(s) from prompts{range}.',
        includeAction: 'Include in prompts',
        included: 'Included {count} floor(s) in prompts{range}.',
        noChat: 'There are no chat floors to process.',
        noMessagesToExclude: 'No selected floors need to be excluded from prompts.',
        noMessagesToInclude: 'No selected floors need to be included in prompts.',
        noLastOperation: 'There is no previous bulk operation to restore.',
        rangePlaceholder: 'all',
        rangeHelp: 'Leave blank to apply to all floors.<br>Exclude from prompts = eye off; include in prompts = eye on. This only affects whether messages are sent to prompts; it does not delete chat messages.',
        rangeLabel: 'Floor range',
        rangeText: ', floors {start}-{end}',
        restoreAction: 'Restore last change',
        restored: 'Restored {count} floor(s).',
        status: 'Prompts: {included}/{total} floor(s) included, {excluded} excluded',
    },
    zh: {
        close: '關閉',
        dialogTitle: '批量設定聊天訊息提示詞狀態',
        clearRange: '清空樓層範圍',
        excludeAction: '從提示詞排除所選樓層',
        excluded: '已從提示詞排除 {count} 樓{range}。',
        includeAction: '將所選樓層納入提示詞',
        included: '已將 {count} 樓納入提示詞{range}。',
        noChat: '目前沒有可處理的聊天樓層。',
        noMessagesToExclude: '所選樓層沒有需要排除的訊息。',
        noMessagesToInclude: '所選樓層沒有需要納入提示詞的訊息。',
        noLastOperation: '沒有可還原的上次批量操作。',
        rangePlaceholder: '全部',
        rangeHelp: '留空代表套用全部樓層。<br>從提示詞排除 = 關閉眼睛；納入提示詞 = 打開眼睛。這只影響訊息是否送入提示詞，不會刪除聊天內容。',
        rangeLabel: '選擇應用的樓層範圍',
        rangeText: '，第 {start}～{end} 樓',
        restoreAction: '還原上次排除／納入',
        restored: '已還原 {count} 樓。',
        status: '提示詞：{included}/{total} 樓納入，{excluded} 樓排除',
    },
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

function isChineseLanguage(language) {
    return String(language ?? '').trim().toLowerCase().startsWith('zh');
}

function getLanguageCandidates() {
    const context = getContext();

    return [
        context.language,
        context.settings?.language,
        context.power_user?.language,
        context.powerUserSettings?.language,
        localStorage.getItem('language'),
        localStorage.getItem('ST_Language'),
        document.documentElement.lang,
    ].filter(Boolean);
}

function getLanguageKey() {
    return getLanguageCandidates().some(isChineseLanguage) ? 'zh' : 'en';
}

function t(key, replacements = {}) {
    let text = TEXT[getLanguageKey()][key] ?? TEXT.en[key] ?? key;

    for (const [name, value] of Object.entries(replacements)) {
        text = text.replaceAll(`{${name}}`, String(value));
    }

    return text;
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
    return Number.isFinite(number) && number >= 0 ? number : null;
}

function escapeAttribute(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function getSelectedRange() {
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

function isSelectedMessage(messageIndex, selectedRange) {
    if (!selectedRange) {
        return true;
    }

    const floor = messageIndex;
    return floor >= selectedRange.start && floor <= selectedRange.end;
}

function getRangeText(selectedRange) {
    if (!selectedRange) {
        return '';
    }

    return t('rangeText', {
        start: selectedRange.start,
        end: selectedRange.end,
    });
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

async function setSelectedPromptState(isExcluded) {
    const context = getContext();
    const chat = context.chat ?? [];

    if (!chat.length) {
        toastr.info(t('noChat'));
        return;
    }

    const selectedRange = getSelectedRange();
    const changed = [];

    for (let messageId = 0; messageId < chat.length; messageId++) {
        if (!isSelectedMessage(messageId, selectedRange)) {
            continue;
        }

        const message = chat[messageId];

        if (!message || message.is_system === isExcluded) {
            continue;
        }

        changed.push({
            id: messageId,
            previous: Boolean(message.is_system),
        });
    }

    if (!changed.length) {
        updateStatus();
        toastr.info(t(isExcluded ? 'noMessagesToExclude' : 'noMessagesToInclude'));
        return;
    }

    for (const item of changed) {
        const message = chat[item.id];
        message.is_system = isExcluded;
        refreshVisibleMessage(item.id, isExcluded);
    }

    refreshSwipeButtons();

    setLastRun({
        changed,
        selectedRange,
        isExcluded,
        chatLength: chat.length,
        createdAt: Date.now(),
    });
    await saveChatAndMetadata();
    updateStatus();

    toastr.success(t(isExcluded ? 'excluded' : 'included', {
        count: changed.length,
        range: getRangeText(selectedRange),
    }));
}

async function excludeSelectedMessages() {
    await setSelectedPromptState(true);
}

async function includeSelectedMessages() {
    await setSelectedPromptState(false);
}

async function restoreLastRun() {
    const context = getContext();
    const chat = context.chat ?? [];
    const lastRun = getLastRun();
    const changed = Array.isArray(lastRun?.changed) ? lastRun.changed : [];

    if (!changed.length) {
        toastr.info(t('noLastOperation'));
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
    toastr.success(t('restored', { count: restoredCount }));
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
    updateStatus();
}

function clearRangeInputs() {
    const settings = getSettings();
    settings.keepStart = '';
    settings.keepEnd = '';

    $('[data-bpe-field="keepStart"], [data-bpe-field="keepEnd"]').val('');
    getContext().saveSettingsDebounced();
    updateStatus();
}

function updateStatus() {
    const context = getContext();
    const chat = context.chat ?? [];
    const excludedCount = chat.filter(message => message?.is_system === true).length;
    const includedCount = chat.length - excludedCount;
    const lastRun = getLastRun();
    const changedCount = Array.isArray(lastRun?.changed) ? lastRun.changed.length : 0;
    const noChat = chat.length === 0;

    $('.bulk_prompt_exclude_status').text(t('status', {
        included: includedCount,
        total: chat.length,
        excluded: excludedCount,
    }));
    $('[data-bpe-action="restore"]').prop('disabled', changedCount === 0).toggleClass('disabled', changedCount === 0);
    $('[data-bpe-action="apply"], [data-bpe-action="include"]').prop('disabled', noChat).toggleClass('disabled', noChat);
}

function renderControlsContent() {
    const settings = getSettings();
    const keepStart = escapeAttribute(settings.keepStart);
    const keepEnd = escapeAttribute(settings.keepEnd);
    const rangePlaceholder = escapeAttribute(t('rangePlaceholder'));

    return `
        <div class="bulk-prompt-exclude__content">
            <div class="bulk-prompt-exclude__range">
                <div class="bulk-prompt-exclude__range-header">
                    <label>${t('rangeLabel')}</label>
                    <button class="menu_button bulk-prompt-exclude__clear-range" data-bpe-action="clear-range" type="button">
                        <i class="fa-solid fa-eraser"></i>
                        <span>${t('clearRange')}</span>
                    </button>
                </div>
                <div class="bulk-prompt-exclude__range-inputs">
                    <input class="text_pole" data-bpe-field="keepStart" type="number" min="0" step="1" inputmode="numeric" placeholder="${rangePlaceholder}" value="${keepStart}">
                    <span>～</span>
                    <input class="text_pole" data-bpe-field="keepEnd" type="number" min="0" step="1" inputmode="numeric" placeholder="${rangePlaceholder}" value="${keepEnd}">
                </div>
            </div>
            <small class="bulk-prompt-exclude__help">${t('rangeHelp')}</small>
            <div class="bulk-prompt-exclude__actions">
                <button class="menu_button" data-bpe-action="apply" type="button">
                    <i class="fa-solid fa-eye-slash"></i>
                    <span>${t('excludeAction')}</span>
                </button>
                <button class="menu_button" data-bpe-action="include" type="button">
                    <i class="fa-solid fa-eye"></i>
                    <span>${t('includeAction')}</span>
                </button>
                <button class="menu_button" data-bpe-action="restore" type="button">
                    <i class="fa-solid fa-rotate-left"></i>
                    <span>${t('restoreAction')}</span>
                </button>
            </div>
            <small class="bulk_prompt_exclude_status"></small>
        </div>
    `;
}

function renderBulkPromptExcludeDialog() {
    if ($('#bulk_prompt_exclude_dialog').length) {
        return;
    }

    const html = `
        <div id="bulk_prompt_exclude_dialog" class="bulk-prompt-exclude-dialog" aria-hidden="true">
            <div class="bulk-prompt-exclude-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="bulk_prompt_exclude_dialog_title">
                <div class="bulk-prompt-exclude-dialog__header">
                    <div class="bulk-prompt-exclude-dialog__title">
                        <i class="fa-solid fa-eye-slash"></i>
                        <span id="bulk_prompt_exclude_dialog_title">${t('dialogTitle')}</span>
                    </div>
                    <button class="menu_button bulk-prompt-exclude-dialog__close" data-bpe-action="close-dialog" type="button" aria-label="${t('close')}">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                ${renderControlsContent()}
            </div>
        </div>
    `;

    $('body').append(html);

    const dialog = $('#bulk_prompt_exclude_dialog');
    bindControls(dialog);
    dialog.off('click.bulkPromptExcludeDialog').on('click.bulkPromptExcludeDialog', event => {
        if (event.target === dialog[0]) {
            closeBulkPromptExcludeDialog();
        }
    });
}

function openBulkPromptExcludeDialog() {
    renderBulkPromptExcludeDialog();
    const dialog = $('#bulk_prompt_exclude_dialog');
    dialog.addClass('bulk-prompt-exclude-dialog--open').attr('aria-hidden', 'false');
    updateStatus();
    dialog.find('[data-bpe-field]').first().trigger('focus');

    $(document).off('keydown.bulkPromptExcludeDialog').on('keydown.bulkPromptExcludeDialog', event => {
        if (event.key === 'Escape') {
            closeBulkPromptExcludeDialog();
        }
    });
}

function closeBulkPromptExcludeDialog() {
    $('#bulk_prompt_exclude_dialog')
        .removeClass('bulk-prompt-exclude-dialog--open')
        .attr('aria-hidden', 'true');
    $(document).off('keydown.bulkPromptExcludeDialog');
}

function bindControls(root) {
    const fields = root.find('[data-bpe-field]').add(root.filter('[data-bpe-field]'));
    const actions = root.find('[data-bpe-action]').add(root.filter('[data-bpe-action]'));

    fields.off('input.bulkPromptExclude').on('input.bulkPromptExclude', persistInputs);
    fields.add(actions.not('[data-bpe-action="open-dialog"]'))
        .off('click.bulkPromptExclude')
        .on('click.bulkPromptExclude', event => event.stopPropagation());
    actions.filter('[data-bpe-action="open-dialog"]').off('click.bulkPromptExcludeAction').on('click.bulkPromptExcludeAction', event => {
        event.preventDefault();
        openBulkPromptExcludeDialog();
    });
    actions.filter('[data-bpe-action="open-dialog"]').off('keydown.bulkPromptExcludeAction').on('keydown.bulkPromptExcludeAction', event => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        event.preventDefault();
        openBulkPromptExcludeDialog();
    });
    actions.filter('[data-bpe-action="close-dialog"]').off('click.bulkPromptExcludeAction').on('click.bulkPromptExcludeAction', event => {
        event.preventDefault();
        event.stopPropagation();
        closeBulkPromptExcludeDialog();
    });
    actions.filter('[data-bpe-action="clear-range"]').off('click.bulkPromptExcludeAction').on('click.bulkPromptExcludeAction', event => {
        event.preventDefault();
        event.stopPropagation();
        clearRangeInputs();
    });
    actions.filter('[data-bpe-action="apply"]').off('click.bulkPromptExcludeAction').on('click.bulkPromptExcludeAction', async event => {
        event.preventDefault();
        event.stopPropagation();
        await excludeSelectedMessages();
    });
    actions.filter('[data-bpe-action="include"]').off('click.bulkPromptExcludeAction').on('click.bulkPromptExcludeAction', async event => {
        event.preventDefault();
        event.stopPropagation();
        await includeSelectedMessages();
    });
    actions.filter('[data-bpe-action="restore"]').off('click.bulkPromptExcludeAction').on('click.bulkPromptExcludeAction', async event => {
        event.preventDefault();
        event.stopPropagation();
        await restoreLastRun();
    });
}

function renderExtensionsMenuControls() {
    const menu = $('#extensionsMenu');

    if (!menu.length || $('#bulk_prompt_exclude_extensions_menu').length) {
        updateStatus();
        return;
    }

    const html = `
        <div id="bulk_prompt_exclude_extensions_menu" class="list-group-item flex-container flexGap5 interactable bulk-prompt-exclude__open-dialog" data-bpe-action="open-dialog" role="button" tabindex="0">
            <div class="fa-solid fa-eye-slash extensionsMenuExtensionButton"></div>
            <span>${DISPLAY_NAME}</span>
        </div>
    `;

    menu.append(html);
    bindControls($('#bulk_prompt_exclude_extensions_menu'));
    updateStatus();
}

jQuery(async () => {
    const context = getContext();
    const eventTypes = context.eventTypes ?? context.event_types;
    renderExtensionsMenuControls();

    context.eventSource.on(eventTypes.APP_READY, renderExtensionsMenuControls);
    context.eventSource.on(eventTypes.CHAT_CHANGED, updateStatus);
    context.eventSource.on(eventTypes.MESSAGE_SENT, updateStatus);
    context.eventSource.on(eventTypes.MESSAGE_RECEIVED, updateStatus);
    context.eventSource.on(eventTypes.MESSAGE_DELETED, updateStatus);
});
