const COLORS = ['#6c63ff', '#ff6243', '#278c67', '#2f78c4', '#d28a13', '#b84f8d', '#58616e', '#8a63d2'];
const ICONS = {
  edit: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 20 4.2-.9L19 8.3a2.1 2.1 0 0 0-3-3L5.2 16 4 20Zm10.6-13.3 2.7 2.7"/></svg>',
  trash: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>',
  drag: '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/></svg>',
};

const elements = {
  groups: document.querySelector('#groups'),
  emptyState: document.querySelector('#emptyState'),
  noResults: document.querySelector('#noResults'),
  searchTerm: document.querySelector('#searchTerm'),
  search: document.querySelector('#searchInput'),
  notice: document.querySelector('#notice'),
  saveStatus: document.querySelector('#saveStatus'),
  editButton: document.querySelector('#editButton'),
  addLinkButton: document.querySelector('#addLinkButton'),
  addGroupButton: document.querySelector('#addGroupButton'),
  emptyAddGroupButton: document.querySelector('#emptyAddGroupButton'),
  clearSearchButton: document.querySelector('#clearSearchButton'),
  dataButton: document.querySelector('#dataButton'),
  dataMenu: document.querySelector('#dataMenu'),
  exportButton: document.querySelector('#exportButton'),
  importButton: document.querySelector('#importButton'),
  importInput: document.querySelector('#importInput'),
  groupDialog: document.querySelector('#groupDialog'),
  groupForm: document.querySelector('#groupForm'),
  groupDialogTitle: document.querySelector('#groupDialogTitle'),
  groupId: document.querySelector('#groupId'),
  groupName: document.querySelector('#groupName'),
  colorChoices: document.querySelector('#colorChoices'),
  linkDialog: document.querySelector('#linkDialog'),
  linkForm: document.querySelector('#linkForm'),
  linkDialogTitle: document.querySelector('#linkDialogTitle'),
  linkId: document.querySelector('#linkId'),
  linkName: document.querySelector('#linkName'),
  linkUrl: document.querySelector('#linkUrl'),
  linkGroup: document.querySelector('#linkGroup'),
  linkIcon: document.querySelector('#linkIcon'),
  confirmDialog: document.querySelector('#confirmDialog'),
  confirmTitle: document.querySelector('#confirmTitle'),
  confirmText: document.querySelector('#confirmText'),
  toast: document.querySelector('#toast'),
};

let dashboard = { version: 1, groups: [], updatedAt: null };
let editing = false;
let selectedColor = COLORS[0];
let currentLinkGroupId = '';
let draggedItem = null;
let saveTimer = null;
let saveChain = Promise.resolve();
let pendingSaves = 0;
let saveScheduled = false;
let toastTimer = null;

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeButton(className, label, icon, handler) {
  const button = createElement('button', className);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = icon;
  button.addEventListener('click', handler);
  return button;
}

function newId() {
  // randomUUID fehlt ohne HTTPS (z. B. http://192.168.x.x), getRandomValues nicht.
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function announce(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('is-visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 2400);
}

function showNotice(message = '') {
  elements.notice.textContent = message;
  elements.notice.hidden = !message;
}

function setSaveStatus(message, saving = false) {
  elements.saveStatus.textContent = message;
  elements.saveStatus.classList.toggle('is-saving', saving);
}

function hostFor(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function imageUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function createAppIcon(link) {
  const wrapper = createElement('span', 'app-icon');
  const customImage = imageUrl(link.icon);
  const source = customImage || `${new URL(link.url).origin}/favicon.ico`;

  if (link.icon && !customImage) {
    wrapper.textContent = link.icon;
    return wrapper;
  }

  const image = document.createElement('img');
  image.src = source;
  image.alt = '';
  image.loading = 'lazy';
  image.referrerPolicy = 'no-referrer';
  image.addEventListener('error', () => {
    wrapper.replaceChildren();
    wrapper.textContent = link.name.slice(0, 1).toUpperCase();
  }, { once: true });
  wrapper.append(image);
  return wrapper;
}

function findLink(linkId) {
  for (const group of dashboard.groups) {
    const index = group.links.findIndex((link) => link.id === linkId);
    if (index !== -1) return { group, link: group.links[index], index };
  }
  return null;
}

function createAppCard(link, group) {
  const card = createElement('a', `app-card${editing ? ' editing' : ''}`);
  card.href = link.url;
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.dataset.linkId = link.id;
  card.draggable = editing;
  card.title = editing ? `${link.name} verschieben` : `${link.name} öffnen`;

  const icon = createAppIcon(link);
  const meta = createElement('span', 'app-meta');
  meta.append(createElement('span', 'app-name', link.name), createElement('span', 'app-host', hostFor(link.url)));
  card.append(icon, meta);

  if (editing) {
    card.addEventListener('click', (event) => event.preventDefault());
    const actions = createElement('span', 'card-actions');
    actions.append(
      makeButton('card-action', `${link.name} bearbeiten`, ICONS.edit, (event) => {
        event.preventDefault();
        event.stopPropagation();
        openLinkDialog(group.id, link);
      }),
      makeButton('card-action delete', `${link.name} löschen`, ICONS.trash, async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!await askConfirmation('App löschen?', `„${link.name}“ wird aus HomeDock entfernt.`)) return;
        group.links = group.links.filter((item) => item.id !== link.id);
        render();
        queueSave();
        announce('App gelöscht');
      }),
    );
    card.append(actions);
    card.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      draggedItem = { type: 'link', linkId: link.id, groupId: group.id };
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', link.id);
      requestAnimationFrame(() => card.classList.add('is-dragging'));
    });
    card.addEventListener('dragend', clearDragState);
  }

  return card;
}

function createGroup(group, visibleLinks) {
  const section = createElement('article', `group${editing ? ' editing' : ''}`);
  section.dataset.groupId = group.id;
  section.style.setProperty('--group-color', group.color);
  section.draggable = editing;

  const header = createElement('header', 'group-head');
  const titleWrap = createElement('div', 'group-title-wrap');
  const kicker = createElement('div', 'group-kicker');
  kicker.append(createElement('span', 'group-dot'), document.createTextNode(`${group.links.length} ${group.links.length === 1 ? 'APP' : 'APPS'}`));
  titleWrap.append(kicker, createElement('h2', '', group.name));
  header.append(titleWrap);

  if (editing) {
    const tools = createElement('div', 'group-tools');
    tools.append(
      makeButton('drag-handle', `${group.name} verschieben`, ICONS.drag, () => {}),
      makeButton('group-action', `${group.name} bearbeiten`, ICONS.edit, () => openGroupDialog(group)),
      makeButton('group-action delete', `${group.name} löschen`, ICONS.trash, async () => {
        const detail = group.links.length
          ? `Die Gruppe „${group.name}“ und ${group.links.length} ${group.links.length === 1 ? 'App' : 'Apps'} werden gelöscht.`
          : `Die leere Gruppe „${group.name}“ wird gelöscht.`;
        if (!await askConfirmation('Gruppe löschen?', detail)) return;
        dashboard.groups = dashboard.groups.filter((item) => item.id !== group.id);
        render();
        queueSave();
        announce('Gruppe gelöscht');
      }),
    );
    header.append(tools);
  }

  const grid = createElement('div', 'app-grid');
  grid.dataset.groupId = group.id;
  for (const link of visibleLinks) grid.append(createAppCard(link, group));

  if (!visibleLinks.length && !editing) {
    grid.append(createElement('p', 'empty-group', 'In dieser Gruppe ist noch nichts.'));
  }

  if (editing) {
    const add = createElement('button', 'add-card');
    add.type = 'button';
    add.innerHTML = '<span aria-hidden="true">+</span><span>App hinzufügen</span>';
    add.addEventListener('click', () => openLinkDialog(group.id));
    grid.append(add);
  }

  section.append(header, grid);

  if (editing) {
    section.addEventListener('dragstart', (event) => {
      if (event.target.closest('.app-card')) return;
      draggedItem = { type: 'group', groupId: group.id };
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', group.id);
      requestAnimationFrame(() => section.classList.add('is-dragging'));
    });
    section.addEventListener('dragend', clearDragState);
    section.addEventListener('dragover', (event) => {
      if (!draggedItem) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      section.classList.add('is-drop-target');
    });
    section.addEventListener('dragleave', (event) => {
      if (!section.contains(event.relatedTarget)) section.classList.remove('is-drop-target');
    });
    section.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      section.classList.remove('is-drop-target');
      if (!draggedItem) return;
      if (draggedItem.type === 'group') moveGroup(draggedItem.groupId, group.id);
      if (draggedItem.type === 'link') {
        const targetCard = event.target.closest('.app-card');
        moveLink(draggedItem.linkId, group.id, targetCard?.dataset.linkId);
      }
      clearDragState();
    });
  }

  return section;
}

function render() {
  const query = elements.search.value.trim().toLocaleLowerCase('de');
  elements.groups.replaceChildren();
  let visibleGroupCount = 0;

  for (const group of dashboard.groups) {
    const groupMatches = group.name.toLocaleLowerCase('de').includes(query);
    const visibleLinks = query && !groupMatches
      ? group.links.filter((link) => `${link.name} ${link.url}`.toLocaleLowerCase('de').includes(query))
      : group.links;
    if (query && !groupMatches && !visibleLinks.length) continue;
    elements.groups.append(createGroup(group, visibleLinks));
    visibleGroupCount += 1;
  }

  elements.emptyState.hidden = dashboard.groups.length !== 0 || Boolean(query);
  elements.noResults.hidden = !query || visibleGroupCount > 0;
  elements.groups.hidden = dashboard.groups.length === 0 || (Boolean(query) && visibleGroupCount === 0);
  elements.searchTerm.textContent = elements.search.value.trim();
  elements.editButton.classList.toggle('is-active', editing);
  elements.editButton.querySelector('span').textContent = editing ? 'Fertig' : 'Ordnen';
  elements.addGroupButton.hidden = dashboard.groups.length === 0;
}

function clearDragState() {
  draggedItem = null;
  document.querySelectorAll('.is-dragging, .is-drop-target').forEach((item) => {
    item.classList.remove('is-dragging', 'is-drop-target');
  });
}

function moveGroup(sourceId, targetId) {
  if (sourceId === targetId) return;
  const sourceIndex = dashboard.groups.findIndex((group) => group.id === sourceId);
  const targetIndex = dashboard.groups.findIndex((group) => group.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [source] = dashboard.groups.splice(sourceIndex, 1);
  const adjustedTarget = dashboard.groups.findIndex((group) => group.id === targetId);
  dashboard.groups.splice(adjustedTarget, 0, source);
  render();
  queueSave();
}

function moveLink(linkId, targetGroupId, beforeLinkId) {
  const found = findLink(linkId);
  const targetGroup = dashboard.groups.find((group) => group.id === targetGroupId);
  if (!found || !targetGroup || beforeLinkId === linkId) return;
  const [link] = found.group.links.splice(found.index, 1);
  const targetIndex = beforeLinkId ? targetGroup.links.findIndex((item) => item.id === beforeLinkId) : -1;
  targetGroup.links.splice(targetIndex < 0 ? targetGroup.links.length : targetIndex, 0, link);
  render();
  queueSave();
}

function renderColorChoices() {
  elements.colorChoices.replaceChildren();
  for (const color of COLORS) {
    const button = createElement('button', `color-choice${color === selectedColor ? ' is-selected' : ''}`);
    button.type = 'button';
    button.style.setProperty('--choice', color);
    button.setAttribute('aria-label', `Farbe ${color}`);
    button.setAttribute('aria-pressed', color === selectedColor ? 'true' : 'false');
    button.addEventListener('click', () => {
      selectedColor = color;
      renderColorChoices();
    });
    elements.colorChoices.append(button);
  }
}

function openGroupDialog(group = null) {
  elements.groupForm.reset();
  elements.groupId.value = group?.id || '';
  elements.groupName.value = group?.name || '';
  elements.groupDialogTitle.textContent = group ? 'Gruppe bearbeiten' : 'Neue Gruppe';
  selectedColor = group?.color || COLORS[dashboard.groups.length % COLORS.length];
  renderColorChoices();
  elements.groupDialog.showModal();
  requestAnimationFrame(() => elements.groupName.focus());
}

function fillGroupSelect(selectedId) {
  elements.linkGroup.replaceChildren();
  for (const group of dashboard.groups) {
    const option = createElement('option', '', group.name);
    option.value = group.id;
    option.selected = group.id === selectedId;
    elements.linkGroup.append(option);
  }
}

function openLinkDialog(groupId = '', link = null) {
  if (!dashboard.groups.length) {
    announce('Lege zuerst eine Gruppe an');
    openGroupDialog();
    return;
  }
  const found = link ? findLink(link.id) : null;
  currentLinkGroupId = found?.group.id || groupId || dashboard.groups[0].id;
  elements.linkForm.reset();
  elements.linkId.value = link?.id || '';
  elements.linkName.value = link?.name || '';
  elements.linkUrl.value = link?.url || '';
  elements.linkIcon.value = link?.icon || '';
  elements.linkDialogTitle.textContent = link ? 'App bearbeiten' : 'App hinzufügen';
  fillGroupSelect(currentLinkGroupId);
  elements.linkDialog.showModal();
  requestAnimationFrame(() => elements.linkName.focus());
}

function askConfirmation(title, text) {
  elements.confirmTitle.textContent = title;
  elements.confirmText.textContent = text;
  elements.confirmDialog.returnValue = '';
  elements.confirmDialog.showModal();
  return new Promise((resolve) => {
    elements.confirmDialog.addEventListener('close', () => resolve(elements.confirmDialog.returnValue === 'confirm'), { once: true });
  });
}

async function putDashboard(payload) {
  const response = await fetch('/api/dashboard', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Speichern fehlgeschlagen.');
  return result;
}

function queueSave() {
  clearTimeout(saveTimer);
  saveScheduled = true;
  setSaveStatus('Änderungen werden gespeichert …', true);
  saveTimer = setTimeout(() => {
    saveScheduled = false;
    const snapshot = structuredClone(dashboard);
    pendingSaves += 1;
    saveChain = saveChain
      .then(() => putDashboard(snapshot))
      .then((saved) => {
        dashboard.updatedAt = saved.updatedAt;
        showNotice();
      })
      .catch((error) => {
        showNotice(`Speichern fehlgeschlagen: ${error.message}`);
        setSaveStatus('Nicht gespeichert');
      })
      .finally(() => {
        pendingSaves -= 1;
        if (pendingSaves === 0 && !saveScheduled && !elements.notice.textContent) setSaveStatus('Gespeichert');
      });
  }, 250);
}

async function loadDashboard() {
  setSaveStatus('Lädt …', true);
  try {
    const response = await fetch('/api/dashboard', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Dashboard konnte nicht geladen werden.');
    dashboard = result;
    showNotice();
    setSaveStatus('Bereit');
    render();
  } catch (error) {
    showNotice(`${error.message} Bitte lade die Seite neu.`);
    setSaveStatus('Verbindung fehlgeschlagen');
  }
}

elements.groupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = elements.groupName.value.trim();
  if (!name) return;
  const existing = dashboard.groups.find((group) => group.id === elements.groupId.value);
  if (existing) {
    existing.name = name;
    existing.color = selectedColor;
  } else {
    dashboard.groups.push({ id: newId(), name, color: selectedColor, links: [] });
  }
  elements.groupDialog.close();
  render();
  queueSave();
  announce(existing ? 'Gruppe aktualisiert' : 'Gruppe angelegt');
});

elements.linkForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = elements.linkName.value.trim();
  let url = elements.linkUrl.value.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    url = parsed.toString();
  } catch {
    elements.linkUrl.setCustomValidity('Bitte gib eine gültige http- oder https-Adresse ein.');
    elements.linkUrl.reportValidity();
    return;
  }
  elements.linkUrl.setCustomValidity('');

  const targetGroup = dashboard.groups.find((group) => group.id === elements.linkGroup.value);
  if (!targetGroup) return;
  const existing = elements.linkId.value ? findLink(elements.linkId.value) : null;
  const link = {
    id: existing?.link.id || newId(),
    name,
    url,
    icon: elements.linkIcon.value.trim(),
  };

  if (existing) {
    existing.group.links.splice(existing.index, 1);
    const insertionIndex = existing.group.id === targetGroup.id ? Math.min(existing.index, targetGroup.links.length) : targetGroup.links.length;
    targetGroup.links.splice(insertionIndex, 0, link);
  } else {
    targetGroup.links.push(link);
  }

  elements.linkDialog.close();
  render();
  queueSave();
  announce(existing ? 'App aktualisiert' : 'App hinzugefügt');
});

elements.search.addEventListener('input', render);
elements.clearSearchButton.addEventListener('click', () => {
  elements.search.value = '';
  render();
  elements.search.focus();
});
elements.editButton.addEventListener('click', () => {
  editing = !editing;
  render();
  announce(editing ? 'Bearbeiten ist aktiv' : 'Änderungen gespeichert');
});
elements.addLinkButton.addEventListener('click', () => openLinkDialog());
elements.addGroupButton.addEventListener('click', () => openGroupDialog());
elements.emptyAddGroupButton.addEventListener('click', () => openGroupDialog());

elements.dataButton.addEventListener('click', () => {
  elements.dataMenu.hidden = !elements.dataMenu.hidden;
  elements.dataButton.setAttribute('aria-expanded', elements.dataMenu.hidden ? 'false' : 'true');
});

document.addEventListener('click', (event) => {
  if (!elements.dataMenu.hidden && !event.target.closest('#dataMenu') && !event.target.closest('#dataButton')) {
    elements.dataMenu.hidden = true;
    elements.dataButton.setAttribute('aria-expanded', 'false');
  }
});

elements.exportButton.addEventListener('click', () => {
  const blob = new Blob([`${JSON.stringify(dashboard, null, 2)}\n`], { type: 'application/json' });
  const download = document.createElement('a');
  download.href = URL.createObjectURL(blob);
  download.download = `homedock-${new Date().toISOString().slice(0, 10)}.json`;
  download.click();
  URL.revokeObjectURL(download.href);
  elements.dataMenu.hidden = true;
  announce('Export erstellt');
});

elements.importButton.addEventListener('click', () => {
  elements.dataMenu.hidden = true;
  elements.importInput.click();
});

elements.importInput.addEventListener('change', async () => {
  const file = elements.importInput.files?.[0];
  elements.importInput.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!await askConfirmation('Konfiguration importieren?', 'Die aktuelle Konfiguration wird durch die ausgewählte Datei ersetzt.')) return;
    clearTimeout(saveTimer);
    saveScheduled = false;
    await saveChain;
    setSaveStatus('Import wird gespeichert …', true);
    dashboard = await putDashboard(parsed);
    showNotice();
    render();
    setSaveStatus('Gespeichert');
    announce('Konfiguration importiert');
  } catch (error) {
    announce(`Import fehlgeschlagen: ${error.message}`);
    setSaveStatus('Import fehlgeschlagen');
  }
});

document.querySelectorAll('.close-dialog').forEach((button) => {
  button.addEventListener('click', () => button.closest('dialog').close());
});

document.querySelectorAll('dialog').forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
});

document.addEventListener('keydown', (event) => {
  const isTyping = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (event.key === '/' && !isTyping && !document.querySelector('dialog[open]')) {
    event.preventDefault();
    elements.search.focus();
  }
});

loadDashboard();
