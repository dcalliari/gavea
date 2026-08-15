/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { readAgentStates, AgentState } from './firstmate';
import { FleetSummary, GitRepositoryState, disambiguatedNames, readGitRepository, repositoryStatus, summarizeFleet } from './git';

interface FleetRepository extends GitRepositoryState {
	readonly agent?: AgentState;
}

class RepositoryItem extends vscode.TreeItem {
	constructor(readonly repository: FleetRepository, label = repository.name) {
		super(label, vscode.TreeItemCollapsibleState.None);
		this.description = repository.error
			? repository.error
			: `${repository.branch || 'HEAD'} · ${repository.changedFiles === 0 ? 'limpo' : `${repository.changedFiles} arquivo(s) alterado(s)`}${formatSync(repository)}`;
		this.tooltip = new vscode.MarkdownString(`**${repository.name}**\n\n${repository.path}`);
		if (repository.agent) {
			this.description += ` · agente ${repository.agent.id}: ${repository.agent.state}`;
			this.tooltip.appendMarkdown(`\n\nAgente **${repository.agent.id}**: ${repository.agent.state}${repository.agent.text ? `, ${repository.agent.text}` : ''}`);
		}
		const status = repositoryStatus(repository, Boolean(repository.agent));
		const icon = status === 'error' ? 'error' : status === 'working' ? 'sync' : status === 'changed' ? 'repo' : 'check';
		const color = status === 'error' ? 'charts.red' : status === 'working' ? 'charts.blue' : status === 'changed' ? 'charts.yellow' : 'charts.green';
		this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
		this.command = repository.error
			? { command: 'gavea.frota.configure', title: 'Configurar Repositórios da Frota' }
			: { command: 'vscode.openFolder', title: 'Abrir Repositório', arguments: [vscode.Uri.file(repository.path), false] };
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

class FleetProvider implements vscode.TreeDataProvider<RepositoryItem> {
	private readonly changeEmitter = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.changeEmitter.event;
	private items: RepositoryItem[] = [];

	getTreeItem(item: RepositoryItem): vscode.TreeItem {
		return item;
	}

	getChildren(): RepositoryItem[] {
		return this.items;
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
			const configuredPaths = configuration.get<string[]>('repositorios', []);
			if (configuredPaths.length === 0) {
				provider.setItems([emptyItem()]);
				statusBar.text = formatFleetSummary({ repositories: 0, changed: 0, activeAgents: 0 });
				return;
			}
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

function emptyItem(): RepositoryItem {
	const item = new RepositoryItem({ path: '', name: 'Nenhum repositório configurado' });
	item.description = 'Configurar agora';
	item.command = { command: 'gavea.frota.configure', title: 'Configurar Repositórios da Frota' };
	return item;
}

function expandHome(value: string): string {
	return value.startsWith('~/') ? path.join(process.env['HOME'] || '', value.slice(2)) : value;
}
