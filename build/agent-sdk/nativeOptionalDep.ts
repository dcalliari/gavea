import fs from 'fs';
import path from 'path';

export function findMissingNativeOptionalDep(nodeModulesDir: string, basePackage: string, target: string): string | undefined {
	if (!fs.existsSync(path.join(nodeModulesDir, basePackage))) {
		return undefined;
	}
	const platformPackage = `${basePackage}-${target}`;
	return fs.existsSync(path.join(nodeModulesDir, platformPackage)) ? undefined : platformPackage;
}
