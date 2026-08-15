/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { readAgentStates, AgentState } from './firstmate';
import { GitRepositoryState, readGitRepository } from './git';

interface FleetRepository extends GitRepositoryState {
	readonly agent?: AgentState;
}

class RepositoryItem extends vscode.TreeItem {
	constructor(readonly repository: FleetRepository) {
		super(repository.name, vscode.TreeItemCollapsibleState.None);
		this.description = repository.error
			? repository.error
			: `${repository.branch || 'HEAD'} · ${repository.changedFiles === 0 ? 'limpo' : `${repository.changedFiles} arquivo(s) alterado(s)`}${formatSync(repository)}`;
		this.tooltip = new vscode.MarkdownString(`**${repository.name}**\n\n${repository.path}`);
		if (repository.agent) {
			this.description += ` · agente ${repository.agent.id}: ${repository.agent.state}`;
			this.tooltip.appendMarkdown(`\n\nAgente **${repository.agent.id}**: ${repository.agent.state}${repository.agent.text ? `, ${repository.agent.text}` : ''}`);
		}
		if (repository.error) {
			this.iconPath = new vscode.ThemeIcon('error');
		}
	}
}

function formatSync(repository: GitRepositoryState): string {
	if (repository.ahead === undefined && repository.behind === undefined) {
		return '';
	}
	return ` · upstream +${repository.ahead || 0}/-${repository.behind || 0}`;
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
	const refresh = async (): Promise<void> => {
		const configuration = vscode.workspace.getConfiguration('gavea.frota');
		const configuredPaths = configuration.get<string[]>('repositorios', []);
		if (configuredPaths.length === 0) {
			provider.setItems([emptyItem()]);
			return;
		}
		const home = expandHome(configuration.get<string>('firstmateHome', '~/dpe/firstmate'));
		const agents = await readAgentStates(home);
		const repositories = await Promise.all(configuredPaths.map(async repositoryPath => {
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
		provider.setItems(repositories.map(repository => new RepositoryItem(repository)));
	};
	context.subscriptions.push(vscode.window.registerTreeDataProvider('gavea.frota', provider));
	context.subscriptions.push(vscode.commands.registerCommand('gavea.frota.refresh', refresh));
	context.subscriptions.push(vscode.commands.registerCommand('gavea.frota.configure', () => vscode.commands.executeCommand('workbench.action.openSettings', '@ext:gavea.gavea-frota')));
	let timer = scheduleRefresh();
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('gavea.frota')) {
			clearInterval(timer);
			timer = scheduleRefresh();
			void refresh();
		}
	}));
	context.subscriptions.push({ dispose: () => clearInterval(timer) });

	function scheduleRefresh(): ReturnType<typeof setInterval> {
		const seconds = Math.max(1, vscode.workspace.getConfiguration('gavea.frota').get<number>('intervaloAtualizacao', 10));
		return setInterval(() => void refresh(), seconds * 1000);
	}
	await refresh();
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
