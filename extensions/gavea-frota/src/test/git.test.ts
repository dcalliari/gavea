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
import { disambiguatedNames, readGitRepository, readGitTask, repositoryStatus, summarizeFleet } from '../git.ts';

const execFileAsync = promisify(execFile);

test('disambiguates duplicate repository names using the shortest path suffix', () => {
	assert.deepStrictEqual(disambiguatedNames([
		{ path: '/projects/gavea', name: 'gavea' },
		{ path: '/.treehouse/1/gavea', name: 'gavea' }
	]), ['gavea (projects)', 'gavea (1)']);
});

test('keeps non-duplicate repository names unchanged', () => {
	assert.deepStrictEqual(disambiguatedNames([
		{ path: '/projects/gavea', name: 'gavea' },
		{ path: '/projects/livre', name: 'livre' }
	]), ['gavea', 'livre']);
});

test('classifies repository states for the fleet signal', () => {
	assert.strictEqual(repositoryStatus({ path: '/repo', name: 'repo', error: 'not found' }, false), 'error');
	assert.strictEqual(repositoryStatus({ path: '/repo', name: 'repo', changedFiles: 0 }, true), 'working');
	assert.strictEqual(repositoryStatus({ path: '/repo', name: 'repo', changedFiles: 2 }, false), 'changed');
	assert.strictEqual(repositoryStatus({ path: '/repo', name: 'repo', changedFiles: 0 }, false), 'clean');
});

test('summarizes changed repositories and active agents', () => {
	assert.deepStrictEqual(summarizeFleet([
		{ path: '/one', name: 'one', changedFiles: 1 },
		{ path: '/two', name: 'two', changedFiles: 0 }
	], new Set(['/one'])), { repositories: 2, changed: 1, activeAgents: 1 });
});

test('reads branch and dirty state', async () => {
	const repository = await fs.mkdtemp(path.join(os.tmpdir(), 'gavea-git-'));
	await execFileAsync('git', ['init', '-q', repository]);
	await fs.writeFile(path.join(repository, 'changed.txt'), 'changed');
	const state = await readGitRepository(repository);
	assert.deepStrictEqual({ branch: state.branch, changedFiles: state.changedFiles, error: state.error }, { branch: 'master', changedFiles: 1, error: undefined });
	await fs.rm(repository, { recursive: true, force: true });
});

test('reads local commits and their changed files', async () => {
	const repository = await fs.mkdtemp(path.join(os.tmpdir(), 'gavea-git-'));
	try {
		await execFileAsync('git', ['init', '-q', repository]);
		await execFileAsync('git', ['-C', repository, 'config', 'user.email', 'test@example.com']);
		await execFileAsync('git', ['-C', repository, 'config', 'user.name', 'Test']);
		await fs.writeFile(path.join(repository, 'committed.txt'), 'committed');
		await execFileAsync('git', ['-C', repository, 'add', 'committed.txt']);
		await execFileAsync('git', ['-C', repository, 'commit', '-q', '-m', 'local commit']);
		const state = await readGitRepository(repository);
		assert.deepStrictEqual(state.localCommits?.map(commit => ({ subject: commit.subject, status: commit.files[0]?.status, path: commit.files[0]?.path })), [{ subject: 'local commit', status: 'A', path: 'committed.txt' }]);
	} finally {
		await fs.rm(repository, { recursive: true, force: true });
	}
});

test('reads a task branch against the project base', async () => {
	const worktree = await fs.mkdtemp(path.join(os.tmpdir(), 'gavea-task-'));
	const project = await fs.mkdtemp(path.join(os.tmpdir(), 'gavea-project-'));
	try {
		await execFileAsync('git', ['init', '-q', worktree]);
		await execFileAsync('git', ['-C', worktree, 'config', 'user.email', 'test@example.com']);
		await execFileAsync('git', ['-C', worktree, 'config', 'user.name', 'Test']);
		await fs.writeFile(path.join(worktree, 'base.txt'), 'base');
		await execFileAsync('git', ['-C', worktree, 'add', 'base.txt']);
		await execFileAsync('git', ['-C', worktree, 'commit', '-q', '-m', 'base']);
		await execFileAsync('git', ['clone', '-q', worktree, project]);
		await execFileAsync('git', ['-C', worktree, 'checkout', '-q', '-b', 'fm/task']);
		await fs.writeFile(path.join(worktree, 'task.txt'), 'task');
		await execFileAsync('git', ['-C', worktree, 'add', 'task.txt']);
		await execFileAsync('git', ['-C', worktree, 'commit', '-q', '-m', 'task change']);
		const state = await readGitTask(worktree, project);
		assert.deepStrictEqual({ branch: state.branch, baseBranch: state.baseBranch, commits: state.commits.length, changedFiles: state.changedFiles, path: state.changedPaths[0]?.path }, { branch: 'fm/task', baseBranch: 'master', commits: 1, changedFiles: 1, path: 'task.txt' });
	} finally {
		await fs.rm(worktree, { recursive: true, force: true });
		await fs.rm(project, { recursive: true, force: true });
	}
});
