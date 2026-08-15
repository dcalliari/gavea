/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';

export interface AgentState {
	readonly id: string;
	readonly state: string;
	readonly text: string;
}

const terminalStates = new Set(['done', 'failed', 'cancelled', 'stopped']);

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
