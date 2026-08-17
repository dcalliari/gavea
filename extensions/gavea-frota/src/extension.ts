/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *---------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { FirstmateTask, readFleetTasks } from './firstmate';
import { readGitTask } from './git';
import { DeckLabels, DeckTask, renderFleetDeck } from './deck';

const firstmateHome = path.join(process.env['HOME'] || '/home/calliari', 'dpe', 'firstmate');

type FleetTask = DeckTask;

/* The log lives beside the firstmate session data so supervisor and captain can collect one file. */
const errorLogPath = path.join(firstmateHome, 'data', 'gavea-errors.log');

async function logError(side: 'extension' | 'webview', event: string, error: unknown, context?: Record<string, string | number | undefined>): Promise<void> {
	const message = sanitize(error instanceof Error ? error.message : String(error));
	const stack = error instanceof Error && error.stack ? sanitize(error.stack) : undefined;
	const details = Object.entries(context || {}).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}=${sanitize(String(value))}`).join(' ');
	const line = JSON.stringify({ at: new Date().toISOString(), side, event, message, ...(stack ? { stack } : {}), ...(details ? { context: details } : {}) }) + '\n';
	try {
		await fs.mkdir(path.dirname(errorLogPath), { recursive: true });
		await fs.appendFile(errorLogPath, line, { mode: 0o600 });
	} catch {
		// Logging must never prevent the observer from opening.
	}
}

function sanitize(value: string): string {
	return value.replace(/(bearer|token|password|passwd|secret|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]').replace(/https?:\/\/[^\s]+/gi, '[url redacted]');
}

/* The deck is the single fleet surface; the former sidebar tree is intentionally removed. */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	let deckPanel: vscode.WebviewPanel | undefined;
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
	statusBar.command = 'gavea.frota.openDeck';
	statusBar.tooltip = 'Frota: tarefas aguardando, em andamento e aterrissadas';
	statusBar.show();
	context.subscriptions.push(statusBar);
	let latestTasks: FleetTask[] = [];
	let refreshing = false;

	const refresh = async (): Promise<void> => {
		if (refreshing) {
			return;
		}
		refreshing = true;
		try {
			const snapshot = await readFleetTasks(firstmateHome);
			if (snapshot.error) {
				await logError('extension', 'fleet-read', snapshot.error);
			}
			const tasks = await Promise.all(snapshot.tasks.map(async task => {
				if (!task.worktreePath) {
					return task;
				}
				const git = await readGitTask(task.worktreePath, task.projectPath);
				if (git.error) {
					await logError('extension', 'git-read', git.error, { task: task.id });
				}
				return { ...task, git };
			}));
			latestTasks = tasks;
			const waiting = tasks.filter(task => taskGroup(task) === 'waiting').length;
			const progress = tasks.filter(task => taskGroup(task) === 'progress').length;
			const landed = tasks.filter(task => taskGroup(task) === 'landed').length;
			statusBar.text = `$(warning) ${waiting} · $(pulse) ${progress} · $(check) ${landed}`;
			if (deckPanel) {
				deckPanel.webview.html = renderFleetDeck(tasks, snapshot.error, deckLabels());
			}
		} catch (error) {
			await logError('extension', 'refresh', error);
		} finally {
			refreshing = false;
		}
	};

	context.subscriptions.push(vscode.commands.registerCommand('gavea.frota.refresh', refresh));
	context.subscriptions.push(vscode.commands.registerCommand('gavea.frota.openDeck', () => {
		if (deckPanel) {
			deckPanel.reveal(vscode.ViewColumn.Active);
			return;
		}
		deckPanel = vscode.window.createWebviewPanel('gavea.frota.deck', vscode.l10n.t('Convés Principal'), vscode.ViewColumn.Active, {
			enableScripts: true,
			retainContextWhenHidden: true
		});
		deckPanel.webview.html = renderFleetDeck([], undefined, deckLabels());
		deckPanel.onDidDispose(() => {
			deckPanel = undefined;
			updateTimer();
		}, undefined, context.subscriptions);
		deckPanel.webview.onDidReceiveMessage(message => void handleDeckMessage(message, () => latestTasks, refresh), undefined, context.subscriptions);
		deckPanel.onDidChangeViewState(() => updateTimer());
		void refresh();
		updateTimer();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gavea.frota.focus', () => vscode.commands.executeCommand('gavea.frota.openDeck')));
	context.subscriptions.push(vscode.window.onDidChangeWindowState(state => {
		updateTimer();
		if (state.focused) {
			void refresh();
		}
	}));
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('gavea.frota.intervaloAtualizacao')) {
			updateTimer();
			void refresh();
		}
	}));
	let timer: ReturnType<typeof setInterval> | undefined;
	const updateTimer = (): void => {
		if (deckPanel?.visible && vscode.window.state.focused) {
			clearInterval(timer);
			const seconds = Math.max(1, vscode.workspace.getConfiguration('gavea.frota').get<number>('intervaloAtualizacao', 10));
			timer = setInterval(() => void refresh(), seconds * 1000);
		} else {
			clearInterval(timer);
			timer = undefined;
		}
	};
	context.subscriptions.push({ dispose: () => clearInterval(timer) });
	await refresh();
	updateTimer();
	await vscode.commands.executeCommand('gavea.frota.openDeck');
}

interface DeckMessage {
	readonly type: string;
	readonly taskId?: string;
	readonly message?: string;
	readonly error?: string;
	readonly source?: string;
	readonly line?: number;
	readonly column?: number;
	readonly stack?: string;
}

interface GitRepositoryApi {
	readonly rootUri?: vscode.Uri;
}

interface GitApi {
	readonly openRepository: (root: vscode.Uri) => Promise<GitRepositoryApi | null>;
	readonly toGitUri: (uri: vscode.Uri, ref: string) => vscode.Uri;
}

interface GitExtension {
	readonly getAPI: (version: 1) => GitApi;
}

async function handleDeckMessage(message: DeckMessage, tasks: () => readonly FleetTask[], refresh: () => Promise<void>): Promise<void> {
	if (message.type === 'webviewError') {
		await logError('webview', 'runtime', message.error || message.message || 'Erro sem mensagem', { source: message.source, line: message.line, column: message.column, stack: message.stack });
		return;
	}
	if (message.type === 'refresh') {
		await refresh();
		return;
	}
	const task = tasks().find(candidate => candidate.id === message.taskId);
	if (!task) {
		return;
	}
	switch (message.type) {
		case 'diff':
			await openTaskDiff(task);
			break;
		case 'openWorktree':
			await openTaskWorktree(task);
			break;
		case 'sourceControl':
			await openTaskSourceControl(task);
			break;
	}
}

async function openTaskWorktree(task: FleetTask): Promise<void> {
	if (!task.worktreePath) {
		await vscode.window.showErrorMessage(`A cópia de trabalho da tarefa ${task.id} não está registrada.`);
		return;
	}
	try {
		await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(task.worktreePath));
	} catch (error) {
		await showTaskError(task, error);
	}
}

async function openTaskSourceControl(task: FleetTask): Promise<void> {
	await openTaskWorktree(task);
	if (task.worktreePath) {
		await vscode.commands.executeCommand('workbench.view.scm');
	}
}

async function openTaskDiff(task: FleetTask): Promise<void> {
	const git = task.git;
	if (!git) {
		await vscode.window.showErrorMessage(`Não há cópia de trabalho disponível para a tarefa ${task.id}.`);
		return;
	}
	if (git.error) {
		await vscode.window.showErrorMessage(`Não foi possível abrir o diff de ${task.id}: ${git.error}`);
		return;
	}
	if (!git.baseRef || !git.headRef || git.changedPaths.length === 0) {
		await vscode.window.showInformationMessage(`A tarefa ${task.id} ainda não tem arquivos alterados contra ${git.baseBranch || 'a base'}.`);
		return;
	}
	const gitExtension = vscode.extensions.getExtension<GitExtension>('vscode.git');
	const gitApi = gitExtension ? (gitExtension.isActive ? gitExtension.exports : await gitExtension.activate())?.getAPI(1) : undefined;
	if (!gitApi) {
		await vscode.window.showErrorMessage('O Source Control nativo do VS Code não está disponível para abrir este diff.');
		return;
	}
	try {
		await gitApi.openRepository(vscode.Uri.file(git.path));
		const resources = git.changedPaths.map(file => ({
			originalUri: file.status === 'A' ? undefined : gitApi.toGitUri(vscode.Uri.file(path.join(git.path, file.path)), git.baseRef as string),
			modifiedUri: file.status === 'D' ? undefined : gitApi.toGitUri(vscode.Uri.file(path.join(git.path, file.path)), git.headRef as string)
		}));
		await vscode.commands.executeCommand('_workbench.openMultiDiffEditor', {
			multiDiffSourceUri: vscode.Uri.from({ scheme: 'git-ref-compare', path: `${git.path}/${git.headRef}` }),
			title: `${task.title} · ${git.branch || task.id}`,
			resources
		});
	} catch (error) {
		await showTaskError(task, error);
	}
}

async function showTaskError(task: FleetTask, error: unknown): Promise<void> {
	const message = error instanceof Error ? error.message : String(error);
	await logError('extension', 'task-action', error, { task: task.id });
	await vscode.window.showErrorMessage(`Não foi possível abrir ${task.id}: ${message}`);
}

function isTerminal(state: string): boolean {
	return ['done', 'failed', 'cancelled', 'stopped'].includes(state.toLowerCase());
}

function taskGroup(task: FirstmateTask): 'waiting' | 'progress' | 'landed' {
	if (isTerminal(task.state) || task.backlogSection === 'done' || task.backlogChecked && task.doneAt) {
		return 'landed';
	}
	if (task.backlogSection === 'queued' || Boolean(task.holdReason) || ['paused', 'blocked', 'needs-decision'].includes(task.state.toLowerCase())) {
		return 'waiting';
	}
	return 'progress';
}

function deckLabels(): DeckLabels {
	return {
		title: vscode.l10n.t('Convés Principal'),
		subtitle: vscode.l10n.t('Veja o que a frota está fazendo e decida o que entra'),
		refresh: vscode.l10n.t('Atualizar'),
		waiting: vscode.l10n.t('Esperando você'),
		waitingDescription: vscode.l10n.t('Tarefas paradas com uma decisão ou motivo exposto'),
		progress: vscode.l10n.t('Em andamento'),
		progressDescription: vscode.l10n.t('Trabalho vivo nas cópias descartáveis dos agentes'),
		landed: vscode.l10n.t('Aterrissadas recentemente'),
		landedDescription: vscode.l10n.t('O que entrou na frota e o resultado registrado'),
		project: vscode.l10n.t('Projeto'),
		agent: vscode.l10n.t('Agente'),
		doing: vscode.l10n.t('Fazendo'),
		elapsed: vscode.l10n.t('Tempo'),
		branch: vscode.l10n.t('Branch'),
		worktree: vscode.l10n.t('Cópia'),
		commits: vscode.l10n.t('Commits'),
		files: vscode.l10n.t('Arquivos'),
		base: vscode.l10n.t('Base'),
		reason: vscode.l10n.t('Motivo'),
		result: vscode.l10n.t('Resultado'),
		landedAt: vscode.l10n.t('entrou'),
		openDiff: vscode.l10n.t('Abrir diff da branch'),
		openWorktree: vscode.l10n.t('Abrir cópia'),
		openSourceControl: vscode.l10n.t('Source Control'),
		noTasks: vscode.l10n.t('Nenhuma tarefa neste bloco.'),
		unavailable: vscode.l10n.t('indisponível'),
		stateError: vscode.l10n.t('Erro de estado'),
		noReason: vscode.l10n.t('O estado não trouxe um motivo.'),
		noResult: vscode.l10n.t('O backlog não registrou um resultado.'),
		noWorktree: vscode.l10n.t('Cópia de trabalho não encontrada'),
		dataError: vscode.l10n.t('Dados da frota')
	};
}
