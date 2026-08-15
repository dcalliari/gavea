/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

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
		return { path: repositoryPath, name, error: message.split('\n')[0] };
	}
}
