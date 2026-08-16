/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *---------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';

export interface AgentState {
	readonly id: string;
	readonly state: string;
	readonly text: string;
}

export interface FirstmateTask {
	readonly id: string;
	readonly title: string;
	readonly project: string;
	readonly projectPath?: string;
	readonly worktreePath?: string;
	readonly kind?: string;
	readonly mode?: string;
	readonly state: string;
	readonly text: string;
	readonly stateError?: string;
	readonly updatedAt?: number;
	readonly holdReason?: string;
	readonly result?: string;
	readonly doneAt?: string;
	readonly backlogChecked: boolean;
	readonly backlogSection?: 'in-flight' | 'queued' | 'done';
}

export interface FirstmateSnapshot {
	readonly tasks: readonly FirstmateTask[];
	readonly error?: string;
}

interface BacklogTask {
	readonly id: string;
	readonly title: string;
	readonly project: string;
	readonly kind?: string;
	readonly mode?: string;
	readonly holdReason?: string;
	readonly result?: string;
	readonly doneAt?: string;
	readonly checked: boolean;
	readonly section: 'in-flight' | 'queued' | 'done';
}

const terminalStates = new Set(['done', 'failed', 'cancelled', 'stopped']);

export async function readFleetTasks(firstmateHome: string): Promise<FirstmateSnapshot> {
	const dataDirectory = path.join(firstmateHome, 'data');
	const stateDirectory = path.join(firstmateHome, 'state');
	let backlog: BacklogTask[] = [];
	let backlogError: string | undefined;
	try {
		backlog = parseBacklog(await fs.readFile(path.join(dataDirectory, 'backlog.md'), 'utf8'));
	} catch (error) {
		backlogError = `Não foi possível ler a fila: ${formatError(error)}`;
	}

	let entries: string[];
	try {
		entries = (await fs.readdir(stateDirectory)).filter(entry => entry.endsWith('.meta'));
	} catch (error) {
		return { tasks: backlog.map(task => fromBacklog(task)), error: backlogError || `Não foi possível ler o estado da frota: ${formatError(error)}` };
	}

	const fromBacklogById = new Map(backlog.map(task => [task.id, task]));
	const tasks = new Map<string, FirstmateTask>(backlog.map(task => [task.id, fromBacklog(task)]));
	for (const entry of entries) {
		const id = entry.slice(0, -5);
		const metadataPath = path.join(stateDirectory, entry);
		try {
			const metadata = parseKeyValue(await fs.readFile(metadataPath, 'utf8'));
			const backlogTask = fromBacklogById.get(id);
			const status = await readLatestStatus(stateDirectory, id);
			const projectPath = metadata.get('project');
			const worktreePath = metadata.get('worktree');
			const stateError = status.error;
			const state = status.state || (backlogTask?.section === 'queued' ? 'aguardando' : backlogTask?.section === 'done' ? 'done' : 'indisponível');
			tasks.set(id, {
				id,
				title: backlogTask?.title || id,
				project: backlogTask?.project || projectName(projectPath),
				projectPath,
				worktreePath,
				kind: metadata.get('kind') || backlogTask?.kind,
				mode: metadata.get('mode') || backlogTask?.mode,
				state,
				text: status.text,
				stateError,
				updatedAt: status.updatedAt,
				holdReason: backlogTask?.holdReason,
				result: backlogTask?.result,
				doneAt: backlogTask?.doneAt,
				backlogChecked: backlogTask?.checked ?? false,
				backlogSection: backlogTask?.section
			});
		} catch (error) {
			const backlogTask = fromBacklogById.get(id);
			tasks.set(id, {
				id,
				title: backlogTask?.title || id,
				project: backlogTask?.project || id,
				state: 'indisponível',
				text: '',
				stateError: `Estado ilegível: ${formatError(error)}`,
				backlogChecked: backlogTask?.checked ?? false,
				backlogSection: backlogTask?.section
			});
		}
	}
	return { tasks: [...tasks.values()], error: backlogError };
}

export async function readAgentStates(firstmateHome: string): Promise<Map<string, AgentState>> {
	const result = new Map<string, AgentState>();
	const stateDirectory = path.join(firstmateHome, 'state');
	let entries: string[];
	try {
		entries = await fs.readdir(stateDirectory);
	} catch {
		return result;
	}
	for (const entry of entries.filter(entry => entry.endsWith('.meta'))) {
		const id = entry.slice(0, -5);
		try {
			const metadata = await fs.readFile(path.join(stateDirectory, entry), 'utf8');
			const project = metadata.split(/\r?\n/).find(line => line.startsWith('project='))?.slice(8);
			if (!project) {
				continue;
			}
			const resolvedProject = await fs.realpath(project);
			const statusLines = (await fs.readFile(path.join(stateDirectory, `${id}.status`), 'utf8')).trim().split(/\r?\n/);
			const latest = statusLines.at(-1);
			if (!latest) {
				continue;
			}
			const separator = latest.indexOf(':');
			const state = (separator < 0 ? latest : latest.slice(0, separator)).trim();
			if (terminalStates.has(state.toLowerCase())) {
				continue;
			}
			result.set(resolvedProject, { id, state, text: separator < 0 ? '' : latest.slice(separator + 1).trim() });
		} catch {
			// A concurrently changing or unreadable record must not affect other repositories.
		}
	}
	return result;
}

function parseKeyValue(value: string): Map<string, string> {
	return new Map(value.split(/\r?\n/).filter(Boolean).map(line => {
		const separator = line.indexOf('=');
		return separator < 0 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1)];
	}));
}

async function readLatestStatus(stateDirectory: string, id: string): Promise<{ state?: string; text: string; updatedAt?: number; error?: string }> {
	const statusPath = path.join(stateDirectory, `${id}.status`);
	try {
		const [contents, stats] = await Promise.all([fs.readFile(statusPath, 'utf8'), fs.stat(statusPath)]);
		const latest = contents.trim().split(/\r?\n/).at(-1);
		if (!latest) {
			return { state: 'indisponível', text: '', updatedAt: stats.mtimeMs, error: 'Estado ilegível: arquivo de status vazio' };
		}
		const separator = latest.indexOf(':');
		return {
			state: (separator < 0 ? latest : latest.slice(0, separator)).trim(),
			text: separator < 0 ? '' : latest.slice(separator + 1).trim(),
			updatedAt: stats.mtimeMs
		};
	} catch (error) {
		return { text: '', error: `Estado ilegível: ${formatError(error)}` };
	}
}

function parseBacklog(contents: string): BacklogTask[] {
	const lines = contents.split(/\r?\n/);
	const tasks: BacklogTask[] = [];
	let section: BacklogTask['section'] | undefined;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (line === '## In flight') {
			section = 'in-flight';
			continue;
		}
		if (line === '## Queued') {
			section = 'queued';
			continue;
		}
		if (line === '## Done') {
			section = 'done';
			continue;
		}
		if (!section) {
			continue;
		}
		const match = /^- \[([ xX])\] ([^ ]+) - (.*)$/.exec(line);
		if (!match) {
			continue;
		}
		const body = match[3];
		const markerIndexes = [' (repo:', ' (kind:', ' (since:', ' (hold:', ' (done:', ' (hold-kind:']
			.map(marker => body.indexOf(marker))
			.filter(markerIndex => markerIndex >= 0);
		const title = body.slice(0, markerIndexes.length ? Math.min(...markerIndexes) : body.length).trim();
		const holdStart = body.indexOf(' (hold: ');
		const holdKindStart = body.indexOf(' (hold-kind:');
		const holdReason = holdStart >= 0 ? body.slice(holdStart + 8, holdKindStart >= 0 ? holdKindStart : body.length).replace(/\)$/, '').trim() : undefined;
		const continuation = [];
		for (let next = index + 1; next < lines.length && !lines[next].startsWith('- [') && !lines[next].startsWith('## '); next++) {
			if (lines[next].trim()) {
				continuation.push(lines[next].trim());
			}
		}
		tasks.push({
			id: match[2],
			title,
			project: field(body, 'repo') || 'sem projeto',
			kind: field(body, 'kind'),
			mode: field(body, 'mode'),
			holdReason,
			result: continuation[0],
			doneAt: /\(done ([^)]+)\)/.exec(body)?.[1],
			checked: match[1].toLowerCase() === 'x',
			section
		});
	}
	return tasks;
}

function fromBacklog(task: BacklogTask): FirstmateTask {
	return {
		id: task.id,
		title: task.title,
		project: task.project,
		kind: task.kind,
		mode: task.mode,
		state: task.section === 'done' ? 'done' : task.section === 'queued' ? 'aguardando' : 'em andamento',
		text: task.holdReason || '',
		holdReason: task.holdReason,
		result: task.result,
		doneAt: task.doneAt,
		backlogChecked: task.checked,
		backlogSection: task.section
	};
}

function field(value: string, name: string): string | undefined {
	return new RegExp(`\\(${name}: ([^)]+)\\)`).exec(value)?.[1];
}

function projectName(projectPath: string | undefined): string {
	return projectPath ? path.basename(projectPath) : 'sem projeto';
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
