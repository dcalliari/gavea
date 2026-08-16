/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export function disambiguatedNames(repositories: readonly Pick<GitRepositoryState, 'path' | 'name'>[]): string[] {
	const counts = new Map<string, number>();
	for (const repository of repositories) {
		counts.set(repository.name, (counts.get(repository.name) || 0) + 1);
	}
	return repositories.map(repository => {
		if (counts.get(repository.name) === 1) {
			return repository.name;
		}
		const matching = repositories.filter(candidate => candidate.name === repository.name);
		const parentComponents = repository.path.split(/[\\/]/).filter(Boolean).slice(0, -1);
		for (let length = 1; length <= parentComponents.length; length++) {
			const suffix = parentComponents.slice(-length).join('/');
			if (matching.every(candidate => {
				const candidateComponents = candidate.path.split(/[\\/]/).filter(Boolean).slice(0, -1);
				return candidate === repository || candidateComponents.slice(-length).join('/') !== suffix;
			})) {
				return `${repository.name} (${suffix})`;
			}
		}
		return `${repository.name} (${repository.path})`;
	});
}

export interface ChangedFile {
	readonly path: string;
	readonly status: string;
}

export interface CommitFile {
	readonly path: string;
	readonly originalPath?: string;
	readonly status: string;
}

export interface LocalCommit {
	readonly hash: string;
	readonly shortHash: string;
	readonly subject: string;
	readonly parent?: string;
	readonly files: readonly CommitFile[];
}

export interface GitRepositoryState {
	readonly path: string;
	readonly name: string;
	readonly branch?: string;
	readonly changedFiles?: number;
	readonly changedPaths?: readonly ChangedFile[];
	readonly localCommits?: readonly LocalCommit[];
	readonly ahead?: number;
	readonly behind?: number;
	readonly error?: string;
}

export interface TaskGitState {
	readonly path: string;
	readonly branch?: string;
	readonly baseBranch?: string;
	readonly baseRef?: string;
	readonly headRef?: string;
	readonly changedFiles: number;
	readonly changedPaths: readonly ChangedFile[];
	readonly commits: readonly LocalCommit[];
	readonly error?: string;
}

export type RepositoryStatus = 'error' | 'working' | 'changed' | 'clean';

export function repositoryStatus(repository: GitRepositoryState, hasActiveAgent: boolean): RepositoryStatus {
	if (repository.error) {
		return 'error';
	}
	if (hasActiveAgent) {
		return 'working';
	}
	if ((repository.changedFiles || 0) > 0) {
		return 'changed';
	}
	return 'clean';
}

export interface FleetSummary {
	readonly repositories: number;
	readonly changed: number;
	readonly activeAgents: number;
}

export function summarizeFleet(repositories: readonly GitRepositoryState[], activeAgentPaths: ReadonlySet<string>): FleetSummary {
	return {
		repositories: repositories.length,
		changed: repositories.filter(repository => (repository.changedFiles || 0) > 0).length,
		activeAgents: repositories.filter(repository => activeAgentPaths.has(repository.path)).length
	};
}

export async function readGitRepository(repositoryPath: string): Promise<GitRepositoryState> {
	const name = repositoryPath.split(/[\\/]/).pop() || repositoryPath;
	try {
		const { stdout } = await execFileAsync('git', ['-C', repositoryPath, 'status', '--porcelain=v1', '--branch'], { maxBuffer: 1024 * 1024 });
		const { branch, ahead, behind, changedPaths } = parseStatus(stdout);
		return {
			path: repositoryPath,
			name,
			branch,
			changedFiles: changedPaths.length,
			changedPaths,
			ahead,
			behind,
			localCommits: await readLocalCommits(repositoryPath)
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const stderr = typeof error === 'object' && error !== null && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : '';
		return { path: repositoryPath, name, error: (stderr || message).trim().split('\n')[0] };
	}
}

export async function readGitTask(worktreePath: string, projectPath?: string): Promise<TaskGitState> {
	try {
		const branch = (await execFileAsync('git', ['-C', worktreePath, 'branch', '--show-current'])).stdout.trim() || undefined;
		const headRef = (await execFileAsync('git', ['-C', worktreePath, 'rev-parse', 'HEAD'])).stdout.trim();
		const basePath = projectPath || worktreePath;
		const baseBranch = (await execFileAsync('git', ['-C', basePath, 'branch', '--show-current'])).stdout.trim() || 'main';
		const baseRef = (await execFileAsync('git', ['-C', basePath, 'rev-parse', '--verify', baseBranch])).stdout.trim();
		const changedPaths = await readDiffPaths(worktreePath, baseRef, headRef);
		const commits = await readCommits(worktreePath, [`${baseRef}..${headRef}`]);
		return { path: worktreePath, branch, baseBranch, baseRef, headRef, changedFiles: changedPaths.length, changedPaths, commits };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const stderr = typeof error === 'object' && error !== null && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : '';
		return { path: worktreePath, changedFiles: 0, changedPaths: [], commits: [], error: (stderr || message).trim().split('\\n')[0] };
	}
}

function parseStatus(stdout: string): { branch?: string; ahead?: number; behind?: number; changedPaths: ChangedFile[] } {
	const lines = stdout.trimEnd().split('\n');
	const header = lines.shift() || '';
	const branchMatch = /^## (.+?)(?:\.\.\.(?:[^ ]+))?(?: \[[^\]]+\])?$/.exec(header);
	const counts = /\[(?:ahead (\d+)(?:, )?)?(?:behind (\d+))?\]/.exec(header);
	return {
		branch: (branchMatch?.[1] || header.replace(/^## /, '')).replace(/^No commits yet on /, '') || undefined,
		ahead: counts ? Number(counts[1]) : undefined,
		behind: counts?.[2] ? Number(counts[2]) : undefined,
		changedPaths: lines.filter(Boolean).map(line => ({ status: line.slice(0, 2).trim(), path: line.slice(3).split(' -> ').at(-1) || line.slice(3) }))
	};
}

async function readLocalCommits(repositoryPath: string): Promise<readonly LocalCommit[]> {
	try {
		let range: string[];
		try {
			const { stdout } = await execFileAsync('git', ['-C', repositoryPath, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
			range = [`${stdout.trim()}..HEAD`];
		} catch {
			range = ['HEAD', '--not', '--remotes'];
		}
		return await readCommits(repositoryPath, range);
	} catch {
		return [];
	}
}

async function readCommits(repositoryPath: string, range: readonly string[]): Promise<readonly LocalCommit[]> {
	const { stdout } = await execFileAsync('git', ['-C', repositoryPath, 'log', '--format=%H%x1f%h%x1f%s%x1f%P', '--no-decorate', ...range], { maxBuffer: 1024 * 1024 });
	const commits = stdout.trimEnd().split('\n').filter(Boolean).map(line => {
		const [hash, shortHash, subject, parents] = line.split('\x1f');
		return { hash, shortHash, subject, parent: parents?.split(' ')[0] || undefined };
	});
	return Promise.all(commits.map(async commit => ({ ...commit, files: await readCommitFiles(repositoryPath, commit.hash) })));
}

async function readDiffPaths(repositoryPath: string, baseRef: string, headRef: string): Promise<ChangedFile[]> {
	const { stdout } = await execFileAsync('git', ['-C', repositoryPath, 'diff', '--name-status', '--find-renames', `${baseRef}...${headRef}`], { maxBuffer: 1024 * 1024 });
	return stdout.trimEnd().split('\n').filter(Boolean).map(line => {
		const [status = '', firstPath = '', secondPath] = line.split('\t');
		return { status: status.charAt(0), path: secondPath || firstPath };
	});
}

async function readCommitFiles(repositoryPath: string, hash: string): Promise<readonly CommitFile[]> {
	try {
		const { stdout } = await execFileAsync('git', ['-C', repositoryPath, 'diff-tree', '--root', '--no-commit-id', '--name-status', '--find-renames', '-r', '-m', hash], { maxBuffer: 1024 * 1024 });
		return stdout.trimEnd().split('\n').filter(Boolean).map(line => {
			const [status = '', firstPath = '', secondPath] = line.split('\t');
			return { status: status.charAt(0), path: secondPath || firstPath, originalPath: status.startsWith('R') ? firstPath : undefined };
		});
	} catch {
		return [];
	}
}
