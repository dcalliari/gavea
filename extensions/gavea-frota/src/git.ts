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

export interface GitRepositoryState {
	readonly path: string;
	readonly name: string;
	readonly branch?: string;
	readonly changedFiles?: number;
	readonly ahead?: number;
	readonly behind?: number;
	readonly error?: string;
}

export async function readGitRepository(repositoryPath: string): Promise<GitRepositoryState> {
	const name = repositoryPath.split(/[\\/]/).pop() || repositoryPath;
	try {
		const { stdout } = await execFileAsync('git', ['-C', repositoryPath, 'status', '--porcelain=v1', '--branch'], { maxBuffer: 1024 * 1024 });
		const lines = stdout.trimEnd().split('\n');
		const header = lines.shift() || '';
		const branchMatch = /^## (.+?)(?:\.\.\.(?:[^ ]+))?(?: \[ahead (\d+)(?:, behind (\d+))?\])?$/.exec(header);
		const counts = /\[ahead (\d+)(?:, behind (\d+))?\]/.exec(header);
		return {
			path: repositoryPath,
			name,
			branch: (branchMatch?.[1] || header.replace(/^## /, '')).replace(/^No commits yet on /, '') || undefined,
			changedFiles: lines.filter(Boolean).length,
			ahead: counts ? Number(counts[1]) : undefined,
			behind: counts?.[2] ? Number(counts[2]) : undefined
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const stderr = typeof error === 'object' && error !== null && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : '';
		return { path: repositoryPath, name, error: (stderr || message).trim().split('\n')[0] };
	}
}
