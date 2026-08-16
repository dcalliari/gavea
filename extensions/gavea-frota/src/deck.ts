/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AgentState } from './firstmate';
import { FleetSummary, GitRepositoryState, LocalCommit } from './git';

export interface DeckRepository extends GitRepositoryState {
	readonly agent?: AgentState;
}

export interface DeckLabels {
	readonly title: string;
	readonly subtitle: string;
	readonly refresh: string;
	readonly configure: string;
	readonly repositories: string;
	readonly changedRepositories: string;
	readonly activeAgents: string;
	readonly branch: string;
	readonly tree: string;
	readonly clean: string;
	readonly changed: string;
	readonly ahead: string;
	readonly behind: string;
	readonly agent: string;
	readonly noAgent: string;
	readonly localCommits: string;
	readonly noLocalCommits: string;
	readonly pull: string;
	readonly push: string;
	readonly diff: string;
	readonly openRepository: string;
	readonly openCommitDiff: string;
	readonly configureNow: string;
	readonly noRepositories: string;
	readonly error: string;
}

export function renderFleetDeck(repositories: readonly DeckRepository[], summary: FleetSummary, labels: DeckLabels): string {
	const nonce = createNonce();
	const cards = repositories.length === 0
		? `<section class="empty"><h2>${escapeHtml(labels.noRepositories)}</h2><button data-action="configure">${escapeHtml(labels.configureNow)}</button></section>`
		: repositories.map(repository => renderRepository(repository, labels)).join('');
	return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>${escapeHtml(labels.title)}</title>
<style>
:root {
	color-scheme: light dark;
	font-family: var(--vscode-font-family);
	font-size: var(--vscode-font-size);
}
* { box-sizing: border-box; }
body {
	margin: 0;
	padding: 24px 28px 40px;
	color: var(--vscode-foreground);
	background: var(--vscode-editor-background);
	overflow-x: hidden;
}
button {
	font: inherit;
	color: var(--vscode-button-foreground);
	background: var(--vscode-button-background);
	border: 1px solid transparent;
	border-radius: 2px;
	padding: 4px 9px;
	cursor: pointer;
}
button:hover { background: var(--vscode-button-hoverBackground); }
button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
button.secondary {
	color: var(--vscode-foreground);
	background: var(--vscode-input-background);
	border-color: var(--vscode-input-border, var(--vscode-widget-border));
}
button.secondary:hover { background: var(--vscode-list-hoverBackground); }
button[disabled] { opacity: .5; cursor: default; }
.deck-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 24px;
	max-width: 1600px;
	margin: 0 auto 22px;
}
h1 { margin: 0 0 5px; font-size: 22px; font-weight: 600; letter-spacing: -.01em; }
.subtitle { margin: 0; color: var(--vscode-descriptionForeground); }
.header-actions { display: flex; flex-wrap: wrap; gap: 8px; flex-shrink: 0; }
.summary {
	display: flex;
	gap: 1px;
	max-width: 1600px;
	margin: 0 auto 20px;
	border: 1px solid var(--vscode-panel-border);
	background: var(--vscode-panel-border);
}
.summary-item { flex: 1; min-width: 130px; padding: 10px 14px; background: var(--vscode-sideBar-background); }
.summary-value { display: block; font-size: 19px; font-weight: 600; }
.summary-label { color: var(--vscode-descriptionForeground); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.fleet-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(100%, 390px), 1fr));
	gap: 14px;
	max-width: 1600px;
	margin: 0 auto;
}
.repository {
	min-width: 0;
	border: 1px solid var(--vscode-panel-border);
	border-top: 3px solid var(--vscode-testing-iconPassed);
	background: var(--vscode-sideBar-background);
}
.repository.working { border-top-color: var(--vscode-charts-blue); }
.repository.changed { border-top-color: var(--vscode-charts-yellow); }
.repository.error { border-top-color: var(--vscode-testing-iconFailed); }
.repo-header { display: flex; justify-content: space-between; gap: 12px; padding: 13px 14px 9px; }
.repo-heading { min-width: 0; }
.repo-name { min-width: 0; font-size: 16px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.repo-path { margin-top: 3px; color: var(--vscode-descriptionForeground); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.status { display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 45%; flex-shrink: 0; overflow: hidden; color: var(--vscode-descriptionForeground); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--vscode-testing-iconPassed); }
.working .status-dot { background: var(--vscode-charts-blue); }
.changed .status-dot { background: var(--vscode-charts-yellow); }
.error .status-dot { background: var(--vscode-testing-iconFailed); }
.repo-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; padding: 0 14px 12px; color: var(--vscode-descriptionForeground); font-size: 12px; }
.repo-meta span { min-width: 0; }
.repo-meta .repo-value { overflow-wrap: anywhere; }
.repo-meta strong { color: var(--vscode-foreground); font-weight: 500; }
.agent {
	margin: 0 14px 12px;
	padding: 9px 10px;
	border-left: 2px solid var(--vscode-charts-blue);
	background: var(--vscode-textBlockQuote-background);
}
.agent-label { color: var(--vscode-descriptionForeground); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
.agent-name { margin-top: 2px; font-weight: 600; overflow-wrap: anywhere; }
.agent-state { color: var(--vscode-textLink-foreground); }
.agent-text { margin-top: 3px; color: var(--vscode-descriptionForeground); font-size: 12px; overflow-wrap: anywhere; }
.no-agent { border-left-color: var(--vscode-panel-border); color: var(--vscode-descriptionForeground); }
.sync {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 1px;
	margin: 0 14px 12px;
	background: var(--vscode-panel-border);
}
.sync-item { padding: 7px 9px; background: var(--vscode-editor-background); }
.sync-value { display: block; font-weight: 600; }
.sync-label { color: var(--vscode-descriptionForeground); font-size: 11px; }
.section { border-top: 1px solid var(--vscode-panel-border); padding: 10px 14px 8px; }
.section-heading { display: flex; justify-content: space-between; margin-bottom: 6px; color: var(--vscode-descriptionForeground); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
.commit { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 5px 0; }
.commit-hash { flex-shrink: 0; color: var(--vscode-textLink-foreground); font-family: var(--vscode-editor-font-family); font-size: 11px; }
.commit-subject { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.commit button { margin-left: auto; flex-shrink: 0; padding: 2px 7px; font-size: 11px; }
.empty { max-width: 540px; margin: 80px auto; padding: 32px; text-align: center; border: 1px solid var(--vscode-panel-border); background: var(--vscode-sideBar-background); }
.empty h2 { margin: 0 0 18px; font-size: 16px; font-weight: 500; overflow-wrap: anywhere; }
.error-message { margin: 0 14px 14px; color: var(--vscode-errorForeground); font-size: 12px; }
@media (max-width: 700px) { body { padding: 16px; } .deck-header { flex-direction: column; } .summary { flex-wrap: wrap; } .summary-item { min-width: calc(50% - 1px); } }
</style>
</head>
<body>
<header class="deck-header">
	<div><h1>${escapeHtml(labels.title)}</h1><p class="subtitle">${escapeHtml(labels.subtitle)}</p></div>
	<div class="header-actions"><button class="secondary" data-action="refresh">${escapeHtml(labels.refresh)}</button><button data-action="configure">${escapeHtml(labels.configure)}</button></div>
</header>
<section class="summary" aria-label="${escapeHtml(labels.title)}">
	<div class="summary-item"><span class="summary-value">${summary.repositories}</span><span class="summary-label">${escapeHtml(labels.repositories)}</span></div>
	<div class="summary-item"><span class="summary-value">${summary.changed}</span><span class="summary-label">${escapeHtml(labels.changedRepositories)}</span></div>
	<div class="summary-item"><span class="summary-value">${summary.activeAgents}</span><span class="summary-label">${escapeHtml(labels.activeAgents)}</span></div>
</section>
<main class="fleet-grid">${cards}</main>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
document.addEventListener('click', event => {
	const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
	if (!target || target.hasAttribute('disabled')) return;
	const message = { type: target.getAttribute('data-action'), repositoryPath: target.getAttribute('data-repository'), commitHash: target.getAttribute('data-commit') };
	vscode.postMessage(message);
});
</script>
</body>
</html>`;
}

function renderRepository(repository: DeckRepository, labels: DeckLabels): string {
	const status = repository.error ? 'error' : repository.agent ? 'working' : repository.changedFiles ? 'changed' : 'clean';
	const statusLabel = repository.error || (repository.agent ? repository.agent.state : repository.changedFiles ? labels.changed : labels.clean);
	const commits = (repository.localCommits || []).slice(0, 5).map(commit => renderCommit(repository, commit, labels)).join('');
	const hasChanges = Boolean(repository.changedPaths?.length);
	return `<article class="repository ${status}">
	<header class="repo-header"><div class="repo-heading"><div class="repo-name" title="${escapeHtml(repository.name)}">${escapeHtml(repository.name)}</div><div class="repo-path" title="${escapeHtml(repository.path)}">${escapeHtml(repository.path)}</div></div><div class="status"><span class="status-dot"></span>${escapeHtml(statusLabel)}</div></header>
	<div class="repo-meta"><span>${escapeHtml(labels.branch)} <strong class="repo-value">${escapeHtml(repository.branch || 'HEAD')}</strong></span><span>${escapeHtml(labels.tree)} <strong>${repository.error ? labels.error : hasChanges ? `${repository.changedFiles} ${labels.changed}` : labels.clean}</strong></span></div>
	${repository.agent ? `<section class="agent"><div class="agent-label">${escapeHtml(labels.agent)}</div><div class="agent-name">${escapeHtml(repository.agent.id)} <span class="agent-state">· ${escapeHtml(repository.agent.state)}</span></div>${repository.agent.text ? `<div class="agent-text">${escapeHtml(repository.agent.text)}</div>` : ''}</section>` : `<section class="agent no-agent"><div class="agent-label">${escapeHtml(labels.agent)}</div><div>${escapeHtml(labels.noAgent)}</div></section>`}
	<section class="sync"><div class="sync-item"><span class="sync-value">${repository.ahead || 0}</span><span class="sync-label">${escapeHtml(labels.ahead)}</span></div><div class="sync-item"><span class="sync-value">${repository.behind || 0}</span><span class="sync-label">${escapeHtml(labels.behind)}</span></div></section>
	<section class="section"><div class="section-heading"><span>${escapeHtml(labels.localCommits)}</span><span>${repository.localCommits?.length || 0}</span></div>${commits || `<div class="commit-subject">${escapeHtml(labels.noLocalCommits)}</div>`}</section>
	<footer class="section"><div class="header-actions"><button class="secondary" data-action="pull" data-repository="${escapeHtml(repository.path)}">${escapeHtml(labels.pull)}</button><button class="secondary" data-action="push" data-repository="${escapeHtml(repository.path)}">${escapeHtml(labels.push)}</button><button class="secondary" data-action="diff" data-repository="${escapeHtml(repository.path)}" ${hasChanges ? '' : 'disabled'}>${escapeHtml(labels.diff)}</button><button data-action="openRepository" data-repository="${escapeHtml(repository.path)}">${escapeHtml(labels.openRepository)}</button></div></footer>
	${repository.error ? `<p class="error-message">${escapeHtml(repository.error)}</p>` : ''}
</article>`;
}

function renderCommit(repository: DeckRepository, commit: LocalCommit, labels: DeckLabels): string {
	return `<div class="commit"><span class="commit-hash">${escapeHtml(commit.shortHash)}</span><span class="commit-subject" title="${escapeHtml(commit.subject)}">${escapeHtml(commit.subject)}</span><button class="secondary" data-action="openCommitDiff" data-repository="${escapeHtml(repository.path)}" data-commit="${escapeHtml(commit.hash)}">${escapeHtml(labels.openCommitDiff)}</button></div>`;
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character);
}

function createNonce(): string {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}
