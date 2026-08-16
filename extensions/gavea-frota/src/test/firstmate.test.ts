/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { test } from 'node:test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { readAgentStates, readFleetTasks } from '../firstmate.ts';

test('reads blocked agent state by resolved project path', async () => {
	const home = await fs.mkdtemp(path.join(os.tmpdir(), 'gavea-firstmate-'));
	const project = await fs.mkdtemp(path.join(os.tmpdir(), 'gavea-project-'));
	const state = path.join(home, 'state');
	await fs.mkdir(state);
	await fs.writeFile(path.join(state, 'task.meta'), `project=${project}\nkind=ship\n`);
	await fs.writeFile(path.join(state, 'task.status'), 'blocked: waiting for review\n');
	const agents = await readAgentStates(home);
	assert.deepStrictEqual(agents.get(await fs.realpath(project)), { id: 'task', state: 'blocked', text: 'waiting for review' });
	await fs.rm(home, { recursive: true, force: true });
	await fs.rm(project, { recursive: true, force: true });
});

test('builds task lanes from the backlog and live state', async () => {
	const home = await fs.mkdtemp(path.join(os.tmpdir(), 'gavea-fleet-'));
	const project = await fs.mkdtemp(path.join(os.tmpdir(), 'gavea-project-'));
	await fs.mkdir(path.join(home, 'state'), { recursive: true });
	await fs.mkdir(path.join(home, 'data'), { recursive: true });
	await fs.writeFile(path.join(home, 'data', 'backlog.md'), [
		'## In flight',
		'- [ ] live-task - Trabalho vivo (repo: gavea) (kind: ship)',
		'## Queued',
		'- [ ] waiting-task - Decisão pendente (repo: solar) (hold: Captain precisa decidir) (hold-kind: captain)',
		'## Done',
		'- [x] landed-task - Trabalho entregue (repo: gavea) (done 2026-08-16)',
		'resultado registrado'
	].join('\n'));
	await fs.writeFile(path.join(home, 'state', 'live-task.meta'), `project=${project}\nworktree=${project}\n`);
	await fs.writeFile(path.join(home, 'state', 'live-task.status'), 'working: implementando\n');
	const snapshot = await readFleetTasks(home);
	assert.deepStrictEqual(snapshot.tasks.map(task => ({ id: task.id, state: task.state, holdReason: task.holdReason, result: task.result, doneAt: task.doneAt })), [
		{ id: 'live-task', state: 'working', holdReason: undefined, result: undefined, doneAt: undefined },
		{ id: 'waiting-task', state: 'aguardando', holdReason: 'Captain precisa decidir', result: undefined, doneAt: undefined },
		{ id: 'landed-task', state: 'done', holdReason: undefined, result: 'resultado registrado', doneAt: '2026-08-16' }
	]);
	await fs.rm(home, { recursive: true, force: true });
	await fs.rm(project, { recursive: true, force: true });
});
