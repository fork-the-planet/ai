import { Command } from "@commander-js/extra-typings";
import { updateDemoDependency } from "../demo-dependencies";
import { generateNpmLockfiles, lintNpmLockfiles } from "../npm";

const program = new Command();

program.name("aicli").description("A handy CLI for developing demos");

program
	.command("generate-npm-lockfiles")
	.description("Generate npm lockfiles to improve install time of demos")
	.action(async () => {
		await generateNpmLockfiles();
	});

program
	.command("lint-npm-lockfiles")
	.description("Lint all demos to ensure npm lockfiles are up to date")
	.action(async () => {
		await lintNpmLockfiles();
	});

program
	.command("update-demo-dependency")
	.description("Update a dependency range in every demo that depends on it")
	.argument("<package>", "dependency package name")
	.argument("<range>", "dependency range to write")
	.action(async (packageName, range) => {
		await updateDemoDependency(packageName, range);
	});

program.parseAsync();
