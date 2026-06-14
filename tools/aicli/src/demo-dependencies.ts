import { promises as fs } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(__dirname, "../../..");

type PackageJson = {
	name?: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};

async function getDemos(): Promise<string[]> {
	const demosRoot = path.resolve(repoRoot, "demos");
	const entries = await fs.readdir(demosRoot, { withFileTypes: true });

	return entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => path.join(demosRoot, entry.name));
}

export async function updateDemoDependency(packageName: string, range: string): Promise<void> {
	const demos = await getDemos();
	let updated = 0;

	for (const demoPath of demos) {
		const packageJsonPath = path.join(demoPath, "package.json");

		let packageJson: PackageJson;
		try {
			packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				continue;
			}
			throw error;
		}

		const currentRange = packageJson.dependencies?.[packageName];
		if (currentRange === undefined || currentRange === range) {
			continue;
		}

		packageJson.dependencies![packageName] = range;
		await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, "\t")}\n`);

		console.log(
			`Updated ${path.relative(repoRoot, packageJsonPath)}: ${packageName} ${currentRange} -> ${range}`,
		);
		updated++;
	}

	if (updated === 0) {
		console.log(`No demos depend on ${packageName} with a different range.`);
		return;
	}

	console.log(`Updated ${updated} demo package.json file(s).`);
}
