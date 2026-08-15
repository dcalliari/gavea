/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { test } from 'node:test';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readGitRepository } from '../git.ts';

const execFileAsync = promisify(execFile);

test('reads branch and dirty state', async () => {
	const repository = await fs.mkdtemp(path.join(os.tmpdir(), 'gavea-git-'));
	await execFileAsync('git', ['init', '-q', repository]);
	await fs.writeFile(path.join(repository, 'changed.txt'), 'changed');
	const state = await readGitRepository(repository);
	assert.deepStrictEqual({ branch: state.branch, changedFiles: state.changedFiles, error: state.error }, { branch: 'master', changedFiles: 1, error: undefined });
	await fs.rm(repository, { recursive: true, force: true });
});
