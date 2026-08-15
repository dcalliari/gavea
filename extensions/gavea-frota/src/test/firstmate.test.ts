/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { test } from 'node:test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { readAgentStates } from '../firstmate.ts';

test('reads active agent state by resolved project path', async () => {
	const home = await fs.mkdtemp(path.join(os.tmpdir(), 'gavea-firstmate-'));
	const project = await fs.mkdtemp(path.join(os.tmpdir(), 'gavea-project-'));
	const state = path.join(home, 'state');
	await fs.mkdir(state);
	await fs.writeFile(path.join(state, 'task.meta'), `project=${project}\nkind=ship\n`);
	await fs.writeFile(path.join(state, 'task.status'), 'working: compiling\n');
	const agents = await readAgentStates(home);
	assert.deepStrictEqual(agents.get(await fs.realpath(project)), { id: 'task', state: 'working', text: 'compiling' });
	await fs.rm(home, { recursive: true, force: true });
	await fs.rm(project, { recursive: true, force: true });
});
