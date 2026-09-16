<script lang="ts">
  import {
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    Check,
    CircleAlert,
    History,
    LoaderCircle,
    RefreshCw,
    Send,
    Settings,
    X,
  } from '@lucide/svelte';
  import { onMount } from 'svelte';
  import {
    actionTypes,
    defaultGestures,
    type ActionInvocation,
    type GestureAction,
    type GestureConfig,
    type GestureSlot,
    type HydratedDeckItem,
  } from '../shared/contracts.ts';
  import { api } from './api.ts';

  let items: HydratedDeckItem[] = [];
  let gestures: GestureConfig = structuredClone(defaultGestures);
  let clientId = 'user-web';
  let coreUrl = '';
  let draft = '';
  let loading = true;
  let acting = false;
  let settingsOpen = false;
  let contextOpen = false;
  let context: unknown;
  let error = '';
  let notice = '';
  let pointerStart: { x: number; y: number } | undefined;
  let drag = { x: 0, y: 0 };

  $: current = items[0];
  $: queueCount = items.length;

  const actionLabel = (action: GestureAction): string => {
    if (action.type === 'send-fixed-message') {
      return action.value?.trim() || 'Fixed reply';
    }
    const labels: Record<GestureAction['type'], string> = {
      'send-fixed-message': 'Fixed reply',
      'send-custom-message': 'Send reply',
      skip: 'Skip',
      'mark-read': 'Mark read',
      'mark-unread': 'Mark unread',
      later: 'Later',
      handled: 'Handled',
      'no-op': 'No action',
    };
    return labels[action.type];
  };

  const load = async (): Promise<void> => {
    loading = true;
    error = '';
    try {
      const [deck, gestureResponse, config] = await Promise.all([
        api.deck(),
        api.gestures(),
        api.config(),
      ]);
      items = deck.items;
      gestures = gestureResponse.gestures;
      clientId = config.clientId;
      coreUrl = config.coreUrl;
    } catch (reason) {
      error = (reason as Error).message;
    } finally {
      loading = false;
    }
  };

  onMount(() => {
    void load();
  });

  const perform = async (action: ActionInvocation): Promise<void> => {
    if (!current || acting) {
      return;
    }
    if (action.type === 'no-op') {
      notice = 'No action configured';
      return;
    }

    const snapshot = items;
    const savedDraft = draft;
    const target = current;
    acting = true;
    error = '';
    notice = '';
    items = items.slice(1);

    try {
      const result = await api.act(target.messageId, action);
      if (!result.advance) {
        items = snapshot;
      }
      if (action.type === 'send-custom-message') {
        draft = '';
      }
      notice =
        result.replyMessageId === undefined
          ? `${actionLabel(action)} applied`
          : `Reply ${result.replyMessageId.slice(0, 8)} sent`;
    } catch (reason) {
      items = snapshot;
      draft = savedDraft;
      error = (reason as Error).message;
    } finally {
      acting = false;
      drag = { x: 0, y: 0 };
    }
  };

  const performSlot = (slot: GestureSlot): void => {
    const action = gestures[slot];
    if (action.type === 'send-custom-message') {
      void perform({ ...action, value: draft });
      return;
    }
    void perform(action);
  };

  const openContext = async (): Promise<void> => {
    if (!current) {
      return;
    }
    contextOpen = true;
    context = undefined;
    try {
      context = (await api.context(current.messageId)).interaction;
    } catch (reason) {
      error = (reason as Error).message;
      contextOpen = false;
    }
  };

  const saveSettings = async (): Promise<void> => {
    for (const action of Object.values(gestures)) {
      if (action.type === 'send-fixed-message' && !action.value?.trim()) {
        error = 'Fixed replies must include text';
        return;
      }
    }
    acting = true;
    error = '';
    try {
      gestures = (await api.saveGestures(gestures)).gestures;
      settingsOpen = false;
      notice = 'Gesture settings saved';
    } catch (reason) {
      error = (reason as Error).message;
    } finally {
      acting = false;
    }
  };

  const updateGestureType = (slot: GestureSlot, type: GestureAction['type']): void => {
    gestures = {
      ...gestures,
      [slot]: type === 'send-fixed-message' ? { type, value: '' } : { type },
    };
  };

  const updateGestureValue = (slot: GestureSlot, value: string): void => {
    gestures = { ...gestures, [slot]: { type: 'send-fixed-message', value } };
  };

  const onKey = (event: KeyboardEvent): void => {
    if (settingsOpen || contextOpen || event.target instanceof HTMLInputElement) {
      return;
    }
    const slotByKey: Partial<Record<string, GestureSlot>> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
    };
    const slot = slotByKey[event.key];
    if (slot) {
      event.preventDefault();
      performSlot(slot);
    }
  };

  const pointerDown = (event: PointerEvent): void => {
    pointerStart = { x: event.clientX, y: event.clientY };
  };

  const pointerMove = (event: PointerEvent): void => {
    if (!pointerStart || acting) {
      return;
    }
    drag = {
      x: Math.max(-130, Math.min(130, event.clientX - pointerStart.x)),
      y: Math.max(-130, Math.min(130, event.clientY - pointerStart.y)),
    };
  };

  const pointerUp = (): void => {
    if (!pointerStart) {
      return;
    }
    pointerStart = undefined;
    const threshold = 70;
    if (Math.abs(drag.x) > Math.abs(drag.y) && Math.abs(drag.x) > threshold) {
      performSlot(drag.x < 0 ? 'left' : 'right');
      return;
    }
    if (Math.abs(drag.y) > threshold) {
      performSlot(drag.y < 0 ? 'up' : 'down');
      return;
    }
    drag = { x: 0, y: 0 };
  };
</script>

<svelte:window on:keydown={onKey} />

<div class="app-shell">
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true"></span>
      <div>
        <strong>openMessage</strong>
        <span>Decision Deck</span>
      </div>
    </div>

    <div class="status-strip">
      <span class="connection-dot"></span>
      <span>{clientId}</span>
      <span class="divider"></span>
      <span>{queueCount} pending</span>
    </div>

    <div class="topbar-actions">
      <button class="icon-button" title="Refresh deck" aria-label="Refresh deck" on:click={() => void load()}>
        <RefreshCw size={18} />
      </button>
      <button
        class="icon-button"
        class:active={settingsOpen}
        title="Gesture settings"
        aria-label="Gesture settings"
        on:click={() => (settingsOpen = true)}
      >
        <Settings size={19} />
      </button>
    </div>
  </header>

  <main class="workspace">
    <section class="deck-stage" aria-live="polite">
      <div class="stage-meta">
        <span>INBOX / {clientId.toUpperCase()}</span>
        {#if current}
          <span>{current.messageId.slice(0, 12)}</span>
        {/if}
      </div>

      {#if loading}
        <div class="state-view">
          <LoaderCircle class="spin" size={28} />
          <p>Loading canonical messages from Core</p>
        </div>
      {:else if !current}
        <div class="state-view empty">
          <Check size={32} />
          <h1>Deck clear</h1>
          <p>New messages addressed to {clientId} will appear here.</p>
          <button class="text-button" on:click={() => void load()}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      {:else}
        <article
          class="decision-card"
          class:dragging={Boolean(pointerStart)}
          style:transform={`translate3d(${drag.x}px, ${drag.y}px, 0) rotate(${drag.x / 28}deg)`}
          on:pointerdown={pointerDown}
          on:pointermove={pointerMove}
          on:pointerup={pointerUp}
          on:pointercancel={pointerUp}
        >
          <div class="card-head">
            <div>
              <span class="eyebrow">FROM</span>
              <h1>{current.message.origin}</h1>
            </div>
            <span class:read={current.attention === 'read'} class="attention">
              {current.attention}
            </span>
          </div>

          <p class="message-content">{current.message.content}</p>

          <div class="message-meta">
            <span>{new Date(current.message.createdAt).toLocaleString()}</span>
            <button class="context-button" on:click|stopPropagation={() => void openContext()}>
              <History size={15} /> Context
            </button>
          </div>

          {#if Math.abs(drag.x) > 30 || Math.abs(drag.y) > 30}
            <div class="gesture-preview">
              {#if Math.abs(drag.x) > Math.abs(drag.y)}
                {actionLabel(gestures[drag.x < 0 ? 'left' : 'right'])}
              {:else}
                {actionLabel(gestures[drag.y < 0 ? 'up' : 'down'])}
              {/if}
            </div>
          {/if}
        </article>

        <form
          class="reply-composer"
          on:submit|preventDefault={() =>
            performSlot('custom-input')}
        >
          <input
            bind:value={draft}
            aria-label="Custom reply"
            placeholder="Write a reply to {current.message.origin}"
            disabled={acting}
          />
          <button class="send-button" type="submit" disabled={acting || !draft.trim()} title="Send reply">
            {#if acting}
              <LoaderCircle class="spin" size={19} />
            {:else}
              <Send size={19} />
            {/if}
            <span>Send</span>
          </button>
        </form>

        <div class="gesture-rail">
          <button on:click={() => performSlot('left')} disabled={acting}>
            <ArrowLeft size={18} />
            <span>{actionLabel(gestures.left)}</span>
          </button>
          <button on:click={() => performSlot('up')} disabled={acting}>
            <ArrowUp size={18} />
            <span>{actionLabel(gestures.up)}</span>
          </button>
          <button on:click={() => performSlot('down')} disabled={acting}>
            <ArrowDown size={18} />
            <span>{actionLabel(gestures.down)}</span>
          </button>
          <button on:click={() => performSlot('right')} disabled={acting}>
            <span>{actionLabel(gestures.right)}</span>
            <ArrowRight size={18} />
          </button>
        </div>
      {/if}

      {#if error}
        <div class="toast error-toast">
          <CircleAlert size={17} />
          <span>{error}</span>
          <button aria-label="Dismiss error" on:click={() => (error = '')}><X size={15} /></button>
        </div>
      {:else if notice}
        <div class="toast">
          <Check size={17} />
          <span>{notice}</span>
        </div>
      {/if}
    </section>

    <aside class:open={settingsOpen} class="settings-panel" aria-hidden={!settingsOpen}>
      <div class="panel-head">
        <div>
          <span class="eyebrow">GLOBAL CONFIG</span>
          <h2>Gesture map</h2>
        </div>
        <button class="icon-button" aria-label="Close settings" on:click={() => (settingsOpen = false)}>
          <X size={19} />
        </button>
      </div>

      <p class="panel-copy">One mapping applies to every card on this client.</p>

      <div class="gesture-settings">
        {#each ['left', 'right', 'up', 'down', 'custom-input'] as slot}
          <label>
            <span>{slot.replace('-', ' ')}</span>
            <select
              value={gestures[slot as GestureSlot].type}
              on:change={(event) =>
                updateGestureType(
                  slot as GestureSlot,
                  event.currentTarget.value as GestureAction['type'],
                )}
            >
              {#each actionTypes as type}
                <option value={type}>{type}</option>
              {/each}
            </select>
          </label>
          {#if gestures[slot as GestureSlot].type === 'send-fixed-message'}
            <input
              class="fixed-value"
              value={gestures[slot as GestureSlot].value ?? ''}
              placeholder="Required fixed reply"
              on:input={(event) =>
                updateGestureValue(slot as GestureSlot, event.currentTarget.value)}
            />
          {/if}
        {/each}
      </div>

      <div class="core-foot">
        <span>CORE</span>
        <code>{coreUrl}</code>
      </div>

      <button class="save-button" disabled={acting} on:click={() => void saveSettings()}>
        <Check size={17} /> Save mappings
      </button>
    </aside>
  </main>

  {#if contextOpen}
    <div class="modal-backdrop" role="presentation" on:click={() => (contextOpen = false)}>
      <div class="context-modal" role="dialog" aria-modal="true" aria-label="Interaction context" tabindex="-1" on:click|stopPropagation on:keydown|stopPropagation>
        <div class="panel-head">
          <div>
            <span class="eyebrow">CORE CANONICAL</span>
            <h2>Interaction context</h2>
          </div>
          <button class="icon-button" aria-label="Close context" on:click={() => (contextOpen = false)}>
            <X size={19} />
          </button>
        </div>
        {#if context === undefined}
          <LoaderCircle class="spin" size={24} />
        {:else}
          <pre>{JSON.stringify(context, null, 2)}</pre>
        {/if}
      </div>
    </div>
  {/if}
</div>
