/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { readAgentStates, AgentState } from './firstmate';
import { ChangedFile, CommitFile, FleetSummary, GitRepositoryState, LocalCommit, disambiguatedNames, readGitRepository, repositoryStatus, summarizeFleet } from './git';

interface FleetRepository extends GitRepositoryState {
	readonly agent?: AgentState;
}

class RepositoryItem extends vscode.TreeItem {
	constructor(readonly repository: FleetRepository, label = repository.name) {
		super(label, repository.error || !repository.path ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed);
		this.contextValue = repository.error || !repository.path ? 'gavea.frota.error' : 'gavea.frota.repository';
		this.description = repository.error
			? repository.error
			: `${repository.branch || 'HEAD'} · ${repository.changedFiles === 0 ? 'limpo' : `${repository.changedFiles} arquivo(s) alterado(s)`}${formatSync(repository)}${repository.localCommits?.length ? ` · ${repository.localCommits.length} commit(s) local(is)` : ''}`;
		this.tooltip = new vscode.MarkdownString(`**${repository.name}**\n\n${repository.path}`);
		if (repository.agent) {
			this.description += ` · agente ${repository.agent.id}: ${repository.agent.state}`;
			this.tooltip.appendMarkdown(`\n\nAgente **${repository.agent.id}**: ${repository.agent.state}${repository.agent.text ? `, ${repository.agent.text}` : ''}`);
		}
		const status = repositoryStatus(repository, Boolean(repository.agent));
		const icon = status === 'error' ? 'error' : status === 'working' ? 'sync' : status === 'changed' ? 'repo' : 'check';
		const color = status === 'error' ? 'charts.red' : status === 'working' ? 'charts.blue' : status === 'changed' ? 'charts.yellow' : 'charts.green';
		this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
		if (repository.error) {
			this.command = { command: 'gavea.frota.configure', title: 'Configurar Repositórios da Frota' };
		}
	}
}

class GroupItem extends vscode.TreeItem {
	constructor(label: string, readonly children: readonly vscode.TreeItem[], description: string) {
		super(label, children.length ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
		this.description = description;
		this.contextValue = 'gavea.frota.group';
	}
}

class CommitItem extends vscode.TreeItem {
	constructor(readonly repository: FleetRepository, readonly commit: LocalCommit) {
		super(`${commit.shortHash} ${commit.subject}`, commit.files.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
		this.contextValue = 'gavea.frota.commit';
		this.description = 'não enviado';
		this.tooltip = `${commit.hash}\n${commit.subject}`;
		this.iconPath = new vscode.ThemeIcon('git-commit');
	}
}

class ChangedFileItem extends vscode.TreeItem {
	constructor(readonly repository: FleetRepository, readonly file: ChangedFile) {
		super(file.path, vscode.TreeItemCollapsibleState.None);
		this.contextValue = 'gavea.frota.changedFile';
		this.description = file.status;
		this.command = { command: 'gavea.frota.openChange', title: 'Abrir Diff', arguments: [this] };
		this.iconPath = new vscode.ThemeIcon('diff');
	}
}

class CommitFileItem extends vscode.TreeItem {
	constructor(readonly repository: FleetRepository, readonly commit: LocalCommit, readonly file: CommitFile) {
		super(file.path, vscode.TreeItemCollapsibleState.None);
		this.contextValue = 'gavea.frota.commitFile';
		this.description = 'conteúdo do commit';
		this.command = { command: 'gavea.frota.openCommitFile', title: 'Abrir Conteúdo do Commit', arguments: [this] };
		this.iconPath = new vscode.ThemeIcon('file');
	}
}

function formatSync(repository: GitRepositoryState): string {
	if (repository.ahead === undefined && repository.behind === undefined) {
		return '';
	}
	return ` · upstream +${repository.ahead || 0}/-${repository.behind || 0}`;
}

function formatFleetSummary(summary: FleetSummary): string {
	return `$(repo) ${summary.repositories} · $(warning) ${summary.changed} · $(pulse) ${summary.activeAgents}`;
}

class FleetProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private readonly changeEmitter = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.changeEmitter.event;
	private items: RepositoryItem[] = [];

	getTreeItem(item: vscode.TreeItem): vscode.TreeItem {
		return item;
	}

	getChildren(item?: vscode.TreeItem): vscode.TreeItem[] {
		if (!item) {
			return this.items;
		}
		if (item instanceof RepositoryItem) {
			if (!item.repository.path) {
				return [];
			}
			const commits = (item.repository.localCommits || []).map(commit => new CommitItem(item.repository, commit));
			const changedFiles = (item.repository.changedPaths || []).map(file => new ChangedFileItem(item.repository, file));
			return [
				new GroupItem('Commits locais', commits, `${commits.length}`),
				new GroupItem('Alterações', changedFiles, `${changedFiles.length}`)
			];
		}
		if (item instanceof GroupItem) {
			return [...item.children];
		}
		if (item instanceof CommitItem) {
			return item.commit.files.map(file => new CommitFileItem(item.repository, item.commit, file));
		}
		return [];
	}

	setItems(items: RepositoryItem[]): void {
		this.items = items;
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
	statusBar.command = 'gavea.frota.focus';
	statusBar.tooltip = 'Frota: repositórios · alterações · agentes ativos';
	statusBar.show();
	context.subscriptions.push(statusBar);
	let refreshing = false;

	const refresh = async (): Promise<void> => {
		if (refreshing) {
			return;
		}
		refreshing = true;
		try {
			const configuration = vscode.workspace.getConfiguration('gavea.frota');
			const configuredPaths = configuration.get<string[]>('repositorios', []).map(expandHome);
			if (configuredPaths.length === 0) {
				provider.setItems([emptyItem()]);
				statusBar.text = formatFleetSummary({ repositories: 0, changed: 0, activeAgents: 0 });
				return;
			}
			ensureWorkspaceFolders(configuredPaths);
			const home = expandHome(configuration.get<string>('firstmateHome', '~/dpe/firstmate'));
			const agents = await readAgentStates(home);
			const repositories: FleetRepository[] = await Promise.all(configuredPaths.map(async (repositoryPath): Promise<FleetRepository> => {
				const state = await readGitRepository(repositoryPath);
				if (state.error) {
					return state;
				}
				try {
					return { ...state, agent: agents.get(await fs.realpath(repositoryPath)) };
				} catch {
					return state;
				}
			}));
			const names = disambiguatedNames(repositories);
			provider.setItems(repositories.map((repository, index) => new RepositoryItem(repository, names[index])));
			const activeAgentPaths = new Set(repositories.filter(repository => repository.agent).map(repository => repository.path));
			statusBar.text = formatFleetSummary(summarizeFleet(repositories, activeAgentPaths));
		} finally {
			refreshing = false;
		}
	};
	context.subscriptions.push(vscode.commands.registerCommand('gavea.frota.refresh', refresh));
	context.subscriptions.push(vscode.commands.registerCommand('gavea.frota.focus', () => vscode.commands.executeCommand('workbench.view.extension.gavea-frota')));
	context.subscriptions.push(vscode.commands.registerCommand('gavea.frota.configure', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:gavea.gavea-frota')));
	context.subscriptions.push(vscode.commands.registerCommand('gavea.frota.pull', async (item: RepositoryItem) => {
		if (item instanceof RepositoryItem) {
			await executeNativeGitAction(item.repository, 'git.pull', 'Pull');
			await refresh();
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gavea.frota.push', async (item: RepositoryItem) => {
		if (item instanceof RepositoryItem) {
			await executeNativeGitAction(item.repository, 'git.push', 'Push');
			await refresh();
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gavea.frota.openChange', async (item: ChangedFileItem) => {
		if (item instanceof ChangedFileItem) {
			await vscode.commands.executeCommand('git.openChange', vscode.Uri.file(path.join(item.repository.path, item.file.path)));
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gavea.frota.openCommitDiff', async (item: CommitItem) => {
		if (item instanceof CommitItem) {
			await openCommitDiff(item.repository, item.commit);
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('gavea.frota.openCommitFile', async (item: CommitFileItem) => {
		if (item instanceof CommitFileItem) {
			await vscode.commands.executeCommand('vscode.open', gitUri(path.join(item.repository.path, item.file.path), item.commit.hash));
		}
	}));
	let timer: ReturnType<typeof setInterval> | undefined;
	const updateTimer = (): void => {
		if (tree.visible && vscode.window.state.focused) {
			clearInterval(timer);
			const seconds = Math.max(1, vscode.workspace.getConfiguration('gavea.frota').get<number>('intervaloAtualizacao', 10));
			timer = setInterval(() => void refresh(), seconds * 1000);
		} else {
			clearInterval(timer);
			timer = undefined;
		}
	};
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
		if (event.affectsConfiguration('gavea.frota')) {
			updateTimer();
			void refresh();
		}
	}));
	context.subscriptions.push({ dispose: () => clearInterval(timer) });
	await refresh();
	updateTimer();
}

async function executeNativeGitAction(repository: FleetRepository, command: 'git.pull' | 'git.push', label: string): Promise<void> {
	try {
		await vscode.commands.executeCommand(command, vscode.Uri.file(repository.path));
		await vscode.window.showInformationMessage(`${label} solicitado para ${repository.name}`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		await vscode.window.showErrorMessage(`Não foi possível executar ${label} em ${repository.name}: ${message}`);
	}
}

async function openCommitDiff(repository: FleetRepository, commit: LocalCommit): Promise<void> {
	if (commit.files.length === 0) {
		await vscode.window.showInformationMessage(`O commit ${commit.shortHash} não possui arquivos alterados`);
		return;
	}
	const resources = commit.files.map(file => ({
		originalUri: file.status === 'A' ? undefined : gitUri(path.join(repository.path, file.originalPath || file.path), commit.parent || `${commit.hash}^`),
		modifiedUri: file.status === 'D' ? undefined : gitUri(path.join(repository.path, file.path), commit.hash)
	}));
	await vscode.commands.executeCommand('_workbench.openMultiDiffEditor', {
		multiDiffSourceUri: vscode.Uri.from({ scheme: 'git-ref-compare', path: `${repository.path}/${commit.hash}` }),
		title: `${commit.shortHash} ${commit.subject}`,
		resources
	});
}

function gitUri(filePath: string, ref: string): vscode.Uri {
	return vscode.Uri.file(filePath).with({ scheme: 'git', query: JSON.stringify({ path: filePath, ref }) });
}

function ensureWorkspaceFolders(configuredPaths: readonly string[]): void {
	const currentPaths = new Set((vscode.workspace.workspaceFolders || []).map(folder => path.resolve(folder.uri.fsPath)));
	const additions = configuredPaths
		.map(expandHome)
		.filter(repositoryPath => !currentPaths.has(path.resolve(repositoryPath)))
		.map(repositoryPath => ({ uri: vscode.Uri.file(repositoryPath), name: path.basename(repositoryPath) }));
	if (additions.length > 0) {
		vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length || 0, 0, ...additions);
	}
}

function emptyItem(): RepositoryItem {
	const item = new RepositoryItem({ path: '', name: 'Nenhum repositório configurado' });
	item.description = 'Configurar agora';
	item.command = { command: 'gavea.frota.configure', title: 'Configurar Repositórios da Frota' };
	return item;
}

function expandHome(value: string): string {
	return value.startsWith('~/') ? path.join(process.env['HOME'] || '', value.slice(2)) : value;
}
