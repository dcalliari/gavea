/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *---------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import { FirstmateTask, readFleetTasks } from './firstmate';
import { readGitTask } from './git';
import { DeckLabels, DeckTask, renderFleetDeck } from './deck';

const firstmateHome = path.join(process.env['HOME'] || '/home/calliari', 'dpe', 'firstmate');

type FleetTask = DeckTask;

class TaskItem extends vscode.TreeItem {
	constructor(readonly task: FleetTask) {
		super(task.title, vscode.TreeItemCollapsibleState.None);
		this.contextValue = 'gavea.frota.task';
		this.description = task.stateError || `${task.project} · ${task.state}`;
		this.tooltip = new vscode.MarkdownString(`**${task.title}**\n\nTarefa \`${task.id}\`\n\nProjeto: **${task.project}**`);
		if (task.holdReason) {
			this.tooltip.appendMarkdown(`\n\nAguardando: ${task.holdReason}`);
		}
		if (task.stateError) {
			this.tooltip.appendMarkdown(`\n\nErro: ${task.stateError}`);
		}
		this.command = { command: 'gavea.frota.openTaskDiff', title: 'Abrir Diff da Tarefa', arguments: [this] };
		const icon = task.stateError ? 'error' : task.backlogSection === 'queued' ? 'warning' : task.backlogSection === 'done' ? 'pass' : 'sync';
		const color = task.stateError ? 'testing.iconFailed' : task.backlogSection === 'queued' ? 'charts.yellow' : task.backlogSection === 'done' ? 'testing.iconPassed' : 'charts.blue';
		this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
	}
}

class TaskGroupItem extends vscode.TreeItem {
	constructor(label: string, readonly children: readonly TaskItem[], description: string) {
		super(label, children.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
		this.contextValue = 'gavea.frota.taskGroup';
		this.description = description;
	}
}

class FleetProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private readonly changeEmitter = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.changeEmitter.event;
	private items: TaskGroupItem[] = [];

	getTreeItem(item: vscode.TreeItem): vscode.TreeItem {
		return item;
	}

	getChildren(item?: vscode.TreeItem): vscode.TreeItem[] {
		return item instanceof TaskGroupItem ? [...item.children] : item ? [] : this.items;
	}

	setItems(tasks: readonly FleetTask[]): void {
		const waiting = tasks.filter(task => isWaiting(task));
		const progress = tasks.filter(task => !isTerminal(task.state) && !waiting.includes(task) && (task.backlogSection === 'in-flight' || Boolean(task.worktreePath)));
		const landed = tasks.filter(task => task.backlogSection === 'done' || task.backlogChecked && task.doneAt).slice(0, 10);
		this.items = [
			new TaskGroupItem('Esperando você', waiting.map(task => new TaskItem(task)), `${waiting.length}`),
			new TaskGroupItem('Em andamento', progress.map(task => new TaskItem(task)), `${progress.length}`),
			new TaskGroupItem('Aterrissadas recentemente', landed.map(task => new TaskItem(task)), `${landed.length}`)
		];
		this.changeEmitter.fire();
	}

	dispose(): void {
		this.changeEmitter.dispose();
	}
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const provider = new FleetProvider();
	context.subscriptions.push(provider);
	const tree = vscode.window.createTreeView('gavea.frota', { treeDataProvider: provider, showCollapseAll: false });
	context.subscriptions.push(tree);
	const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
	statusBar.command = 'gavea.frota.openDeck';
	statusBar.tooltip = 'Frota: tarefas aguardando, em andamento e aterrissadas';
	statusBar.show();
	context.subscriptions.push(statusBar);
	let deckPanel: vscode.WebviewPanel | undefined;
	let latestTasks: FleetTask[] = [];
	let refreshing = false;

	const refresh = async (): Promise<void> => {
		if (refreshing) {
			return;
		}
		refreshing = true;
		try {
			const snapshot = await readFleetTasks(firstmateHome);
			const tasks = await Promise.all(snapshot.tasks.map(async task => {
				if (!task.worktreePath) {
					return task;
				}
				const git = await readGitTask(task.worktreePath, task.projectPath);
				return { ...task, git };
			}));
			latestTasks = tasks;
			provider.setItems(tasks);
			const waiting = tasks.filter(task => isWaiting(task)).length;
			const progress = tasks.filter(task => !isTerminal(task.state) && !isWaiting(task) && (task.backlogSection === 'in-flight' || Boolean(task.worktreePath))).length;
			const landed = tasks.filter(task => task.backlogSection === 'done').length;
			statusBar.text = `$(warning) ${waiting} · $(pulse) ${progress} · $(check) ${landed}`;
			if (deckPanel) {
				deckPanel.webview.html = renderFleetDeck(tasks, snapshot.error, deckLabels());
			}
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
	context.subscriptions.push(vscode.commands.registerCommand('gavea.frota.openTaskDiff', async (item: TaskItem) => {
		if (item instanceof TaskItem) {
			await openTaskDiff(item.task);
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gavea.frota.openTaskWorktree', async (item: TaskItem) => {
		if (item instanceof TaskItem) {
			await openTaskWorktree(item.task);
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gavea.frota.openTaskSourceControl', async (item: TaskItem) => {
		if (item instanceof TaskItem) {
			await openTaskSourceControl(item.task);
		}
	}));
	context.subscriptions.push(tree.onDidChangeVisibility(() => {
		updateTimer();
		if (tree.visible) {
			void refresh();
		}
	}));
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
		if ((tree.visible || deckPanel?.visible) && vscode.window.state.focused) {
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
}

interface DeckMessage {
	readonly type: string;
	readonly taskId?: string;
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
	await vscode.window.showErrorMessage(`Não foi possível abrir ${task.id}: ${message}`);
}

function isTerminal(state: string): boolean {
	return ['done', 'failed', 'cancelled', 'stopped'].includes(state.toLowerCase());
}

function isWaiting(task: FirstmateTask): boolean {
	return task.backlogSection === 'queued' || Boolean(task.holdReason) || ['paused', 'blocked', 'needs-decision'].includes(task.state.toLowerCase());
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
		task: vscode.l10n.t('Tarefa'),
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
