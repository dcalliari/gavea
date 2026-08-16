/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *---------------------------------------------------------------------------------------------*/

import { FirstmateTask } from './firstmate';
import { TaskGitState } from './git';

export interface DeckTask extends FirstmateTask {
	readonly git?: TaskGitState;
}

export interface DeckLabels {
	readonly title: string;
	readonly subtitle: string;
	readonly refresh: string;
	readonly waiting: string;
	readonly waitingDescription: string;
	readonly progress: string;
	readonly progressDescription: string;
	readonly landed: string;
	readonly landedDescription: string;
	readonly task: string;
	readonly project: string;
	readonly agent: string;
	readonly doing: string;
	readonly elapsed: string;
	readonly branch: string;
	readonly worktree: string;
	readonly commits: string;
	readonly files: string;
	readonly base: string;
	readonly reason: string;
	readonly result: string;
	readonly landedAt: string;
	readonly openDiff: string;
	readonly openWorktree: string;
	readonly openSourceControl: string;
	readonly noTasks: string;
	readonly unavailable: string;
	readonly stateError: string;
	readonly noReason: string;
	readonly noResult: string;
	readonly noWorktree: string;
	readonly dataError: string;
}

export function renderFleetDeck(tasks: readonly DeckTask[], dataError: string | undefined, labels: DeckLabels): string {
	const nonce = createNonce();
	const waiting = tasks.filter(task => isWaiting(task));
	const progress = tasks.filter(task => !isTerminal(task.state) && !waiting.includes(task) && (task.backlogSection === 'in-flight' || Boolean(task.worktreePath)));
	const landed = tasks.filter(task => task.backlogSection === 'done' || task.backlogChecked && task.doneAt).slice(0, 10);
	return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>${escapeHtml(labels.title)}</title>
<style>
:root { color-scheme: light dark; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
* { box-sizing: border-box; }
body { margin: 0; padding: 20px 28px 36px; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
button { font: inherit; color: var(--vscode-button-foreground); background: var(--vscode-button-background); border: 1px solid transparent; border-radius: 2px; padding: 4px 9px; cursor: pointer; white-space: nowrap; }
button:hover { background: var(--vscode-button-hoverBackground); }
button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
button.secondary { color: var(--vscode-foreground); background: var(--vscode-input-background); border-color: var(--vscode-input-border, var(--vscode-widget-border)); }
button.secondary:hover { background: var(--vscode-list-hoverBackground); }
button[disabled] { opacity: .5; cursor: default; }
.deck-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin: 0 auto 18px; max-width: 1800px; }
.eyebrow { margin: 0 0 4px; color: var(--vscode-textLink-foreground); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; }
h1 { margin: 0 0 4px; font-size: 22px; font-weight: 600; letter-spacing: -.01em; }
.subtitle { margin: 0; color: var(--vscode-descriptionForeground); }
.header-actions { display: flex; flex-wrap: wrap; gap: 7px; flex-shrink: 0; }
.data-error { margin: 0 auto 14px; max-width: 1800px; padding: 9px 12px; border-left: 3px solid var(--vscode-testing-iconFailed); color: var(--vscode-errorForeground); background: var(--vscode-inputValidation-errorBackground); }
.lane { max-width: 1800px; margin: 0 auto 16px; border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); }
.lane.waiting { border-top: 3px solid var(--vscode-charts-yellow); }
.lane.progress { border-top: 3px solid var(--vscode-charts-blue); }
.lane.landed { border-top: 3px solid var(--vscode-testing-iconPassed); }
.lane-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 20px; padding: 11px 14px 9px; border-bottom: 1px solid var(--vscode-panel-border); }
.lane-title { margin: 0; font-size: 14px; font-weight: 600; }
.lane-title::before { content: ' '; display: inline-block; width: 7px; height: 7px; margin: 0 8px 2px 0; border-radius: 50%; background: var(--vscode-charts-blue); }
.waiting .lane-title::before { background: var(--vscode-charts-yellow); }
.landed .lane-title::before { background: var(--vscode-testing-iconPassed); }
.lane-description { margin: 2px 0 0; color: var(--vscode-descriptionForeground); font-size: 12px; }
.lane-count { color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); font-size: 12px; }
.task-row { display: grid; grid-template-columns: minmax(260px, 2.1fr) minmax(190px, 1.1fr) minmax(240px, 1.3fr) auto; gap: 14px; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--vscode-panel-border); }
.task-row:last-child { border-bottom: 0; }
.task-row:hover { background: var(--vscode-list-hoverBackground); }
.task-title { min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
.task-id { display: block; margin-top: 3px; color: var(--vscode-descriptionForeground); font-family: var(--vscode-editor-font-family); font-size: 11px; overflow-wrap: anywhere; }
.task-project, .task-muted { color: var(--vscode-descriptionForeground); font-size: 12px; overflow-wrap: anywhere; }
.task-reason { margin-top: 4px; color: var(--vscode-foreground); font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
.task-reason strong { color: var(--vscode-textLink-foreground); font-weight: 500; }
.task-fields { display: flex; flex-wrap: wrap; gap: 5px 13px; align-items: baseline; }
.task-field { min-width: 0; color: var(--vscode-descriptionForeground); font-size: 11px; }
.task-field strong { color: var(--vscode-foreground); font-weight: 500; overflow-wrap: anywhere; }
.task-doing { margin-top: 4px; color: var(--vscode-textLink-foreground); font-size: 12px; overflow-wrap: anywhere; }
.task-error { margin-top: 4px; color: var(--vscode-errorForeground); font-size: 12px; overflow-wrap: anywhere; }
.task-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 5px; }
.task-actions button { font-size: 12px; }
.task-actions .primary { font-weight: 600; }
.empty-lane { padding: 14px; color: var(--vscode-descriptionForeground); font-size: 12px; }
@media (max-width: 1000px) { .task-row { grid-template-columns: 1fr 1fr; } .task-actions { justify-content: flex-start; } }
@media (max-width: 650px) { body { padding: 14px; } .deck-header { flex-direction: column; } .task-row { grid-template-columns: 1fr; gap: 7px; } }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
</style>
</head>
<body>
<header class="deck-header">
	<div><p class="eyebrow">Gávea / observação</p><h1>${escapeHtml(labels.title)}</h1><p class="subtitle">${escapeHtml(labels.subtitle)}</p></div>
	<div class="header-actions"><button class="secondary" data-action="refresh">${escapeHtml(labels.refresh)}</button></div>
</header>
${dataError ? `<p class="data-error"><strong>${escapeHtml(labels.dataError)}</strong> ${escapeHtml(dataError)}</p>` : ''}
<main>
	${renderLane('waiting', labels.waiting, labels.waitingDescription, waiting, labels)}
	${renderLane('progress', labels.progress, labels.progressDescription, progress, labels)}
	${renderLane('landed', labels.landed, labels.landedDescription, landed, labels)}
</main>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
document.addEventListener('click', event => {
	const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
	if (!target || target.hasAttribute('disabled')) return;
	vscode.postMessage({ type: target.getAttribute('data-action'), taskId: target.getAttribute('data-task') });
});
</script>
</body>
</html>`;
}

function renderLane(kind: 'waiting' | 'progress' | 'landed', title: string, description: string, tasks: readonly DeckTask[], labels: DeckLabels): string {
	return `<section class="lane ${kind}"><header class="lane-heading"><div><h2 class="lane-title">${escapeHtml(title)}</h2><p class="lane-description">${escapeHtml(description)}</p></div><span class="lane-count">${tasks.length}</span></header>${tasks.length ? tasks.map(task => renderTask(kind, task, labels)).join('') : `<div class="empty-lane">${escapeHtml(labels.noTasks)}</div>`}</section>`;
}

function renderTask(kind: 'waiting' | 'progress' | 'landed', task: DeckTask, labels: DeckLabels): string {
	const git = task.git;
	const worktreeAvailable = Boolean(task.worktreePath && !git?.error);
	const actionTitle = git?.error || task.stateError || (!task.worktreePath && kind !== 'waiting' ? labels.noWorktree : undefined);
	if (kind === 'waiting') {
		return `<article class="task-row"><div><div class="task-title">${escapeHtml(task.title)}</div><span class="task-id">${escapeHtml(task.id)}</span></div><div class="task-project">${escapeHtml(labels.project)} <strong>${escapeHtml(task.project)}</strong></div><div><div class="task-reason"><strong>${escapeHtml(labels.reason)}:</strong> ${escapeHtml(task.holdReason || task.text || task.stateError || task.git?.error || labels.noReason)}</div></div>${renderActions(task, worktreeAvailable, labels, actionTitle)}</article>`;
	}
	if (kind === 'landed') {
		return `<article class="task-row"><div><div class="task-title">${escapeHtml(task.title)}</div><span class="task-id">${escapeHtml(task.id)}</span></div><div class="task-project">${escapeHtml(labels.project)} <strong>${escapeHtml(task.project)}</strong><div class="task-muted">${escapeHtml(labels.landedAt)} ${escapeHtml(task.doneAt || labels.unavailable)}</div></div><div><div class="task-reason"><strong>${escapeHtml(labels.result)}:</strong> ${escapeHtml(task.result || labels.noResult)}</div></div>${renderActions(task, worktreeAvailable, labels, actionTitle)}</article>`;
	}
	return `<article class="task-row"><div><div class="task-title">${escapeHtml(task.title)}</div><span class="task-id">${escapeHtml(task.id)}</span><div class="task-doing">${escapeHtml(task.text || task.state)}</div>${task.stateError || git?.error || !task.worktreePath ? `<div class="task-error">${escapeHtml(task.stateError || git?.error || labels.noWorktree)}</div>` : ''}</div><div><div class="task-project">${escapeHtml(labels.project)} <strong>${escapeHtml(task.project)}</strong></div><div class="task-fields"><span class="task-field">${escapeHtml(labels.agent)} <strong>${escapeHtml(task.id)}</strong></span><span class="task-field">${escapeHtml(labels.elapsed)} <strong>${escapeHtml(formatElapsed(task.updatedAt))}</strong></span></div></div><div class="task-fields"><span class="task-field">${escapeHtml(labels.branch)} <strong>${escapeHtml(git?.branch || labels.unavailable)}</strong></span><span class="task-field">${escapeHtml(labels.base)} <strong>${escapeHtml(git?.baseBranch || labels.unavailable)}</strong></span><span class="task-field">${escapeHtml(labels.commits)} <strong>${git?.commits.length ?? 0}</strong></span><span class="task-field">${escapeHtml(labels.files)} <strong>${git?.changedFiles ?? 0}</strong></span><span class="task-field">${escapeHtml(labels.worktree)} <strong title="${escapeHtml(task.worktreePath || '')}">${escapeHtml(shortPath(task.worktreePath) || labels.unavailable)}</strong></span></div>${renderActions(task, worktreeAvailable, labels, actionTitle)}</article>`;
}

function renderActions(task: DeckTask, worktreeAvailable: boolean, labels: DeckLabels, title: string | undefined): string {
	return `<div class="task-actions"><button class="primary" data-action="diff" data-task="${escapeHtml(task.id)}" title="${escapeHtml(title || labels.openDiff)}">${escapeHtml(labels.openDiff)}</button><button class="secondary" data-action="openWorktree" data-task="${escapeHtml(task.id)}" ${worktreeAvailable ? '' : 'disabled'}>${escapeHtml(labels.openWorktree)}</button><button class="secondary" data-action="sourceControl" data-task="${escapeHtml(task.id)}" ${worktreeAvailable ? '' : 'disabled'}>${escapeHtml(labels.openSourceControl)}</button></div>`;
}

function isTerminal(state: string): boolean {
	return ['done', 'failed', 'cancelled', 'stopped'].includes(state.toLowerCase());
}

function isWaiting(task: DeckTask): boolean {
	return task.backlogSection === 'queued' || Boolean(task.holdReason) || ['paused', 'blocked', 'needs-decision'].includes(task.state.toLowerCase());
}

function formatElapsed(updatedAt: number | undefined): string {
	if (!updatedAt) return 'indisponível';
	const minutes = Math.max(0, Math.floor((Date.now() - updatedAt) / 60000));
	if (minutes < 1) return 'agora';
	if (minutes < 60) return `há ${minutes} min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `há ${hours} h`;
	return `há ${Math.floor(hours / 24)} d`;
}

function shortPath(value: string | undefined): string {
	if (!value) return '';
	return value.replace(/^\/home\/[^/]+\//, '~/');
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character);
}

function createNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}
