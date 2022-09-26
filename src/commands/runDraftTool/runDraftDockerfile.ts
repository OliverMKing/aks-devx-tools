import * as vscode from 'vscode';
import { getExtensionPath, longRunning } from './../../utils/host';
import { failed } from './../../utils/errorable';
import { downloadDraftBinary } from './helper/runDraftHelper';
import { QuickPickItem, window, CancellationToken, ExtensionContext } from 'vscode';
import { buildCreateCommand, buildCreateConfig } from './helper/draftCommandBuilder';
import { runDraftCommand } from './helper/runDraftHelper';
import { reporter } from './../../utils/reporter';
import { MultiStepInput } from './model/stepInput';
import * as fs from 'fs';


export default async function runDraftCreateCmdPalette(
    _context: vscode.ExtensionContext,
    destination: string
): Promise<void> {

    const downladResult = await longRunning(`Downloading Draft.`, () => downloadDraftBinary());
    if (!downladResult) {
        return undefined;
    }

    multiStepInput(_context, destination);
}

export async function multiStepInput(context: ExtensionContext, destination: string) {
    const title = 'Draft a Dockerfile from source code';

	const languages: QuickPickItem[] = ['clojure', 'c#', 'erlang', 'go', 'gomodule', "java", "gradle", "javascript", "php", "python", "rust", "swift"]
		.map(label => ({ label }));
    const deploymentTypes: QuickPickItem[] = ['helm', 'kustomize', 'manifests']
		.map(label => ({ label }));

	interface State {
		title: string;
		step: number;
		totalSteps: number;
        fileType: QuickPickItem | string;
        language: string;
        portNumber: string;
        deploymentType: string;
        outputFile: string;
        sourceFolder: string;
		runtime: QuickPickItem;
	}

	async function collectInputs() {
		const state = {} as Partial<State>;
		await MultiStepInput.run(input => inputSourceCodeFolder(input, state, 1));
		return state as State;
	}

    const totalSteps = 5;
    async function inputSourceCodeFolder(input: MultiStepInput, state: Partial<State>, step: number) {
		state.sourceFolder = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.sourceFolder === 'string' ? state.sourceFolder : '',
			prompt: 'Folder with your source code e.g. ./src)',
            validate: async (file: string) => {
                await new Promise(resolve => setTimeout(resolve, 250));
                const errMsg = "Input must be an existing directory";

                if (!fs.existsSync(file))
                    return errMsg;


                if (!fs.lstatSync(file).isDirectory())
                    return errMsg;

                return undefined;
            },
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => inputOutputFile(input, state, step + 1);
	}

    async function inputOutputFile(input: MultiStepInput, state: Partial<State>, step: number) {
		state.outputFile = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.outputFile=== 'string' ? state.outputFile: '',
			prompt: 'Output file destination (e.g. ./Dockerfile)',
            validate: async () => {
                const pathErr = "Destination must be a file path";

                return undefined;
            },
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => selectLanguage(input, state, step + 1);
	}

	async function selectLanguage(input: MultiStepInput, state: Partial<State>, step: number) {
		const pick = await input.showQuickPick({
			title,
			step: step,
			totalSteps: totalSteps,
			placeholder: 'Select the programming language',
			items: languages,
			activeItem: typeof state.language !== 'string' ? state.language : undefined,
			shouldResume: shouldResume
		});
		state.language = pick.label;
        return (input: MultiStepInput) => inputPortNumber(input, state, step + 1);
	}

    async function inputPortNumber(input: MultiStepInput, state: Partial<State>, step: number) {
		state.portNumber = await input.showInputBox({
			title,
			step: step,
			totalSteps: totalSteps,
			value: typeof state.portNumber === 'string' ? state.portNumber : '',
			prompt: 'Port (e.g.8080)',
			validate: validatePort,
			shouldResume: shouldResume
		});
	}


	function shouldResume() {
		return new Promise<boolean>((resolve, reject) => {
			// noop
		});
	}

	async function validatePort(port: string) {
        // wait before validating so users don't see error messages while typing 
		await new Promise(resolve => setTimeout(resolve, 250));

        const portNum = parseInt(port);
        const portMin = 1;
        const portMax = 65535;
        const portErr = `Port must be in range ${portMin} to ${portMax}`;

        if (Number.isNaN(portNum)) return portErr;
        if (portNum < portMin) return portErr;
        if (portNum > portMax) return portErr

        return undefined;
	}

	const state = await collectInputs();

    const language = state.language;
    const fileType = state.fileType;
    const port = state.portNumber;
    const appName = "";
    const workflow = state.deploymentType;
    const dotnetVersion = "";

    const configPath = buildCreateConfig(language, port, appName, workflow, dotnetVersion);
    const command = buildCreateCommand(destination, fileType.toString(), configPath);

    const result = await runDraftCommand(command);
    if (reporter) {
      const resultSuccessOrFailure = result[1]?.length === 0 && result[0]?.length !== 0;
      reporter.sendTelemetryEvent("createDraftResult", { createDraftResult: `${resultSuccessOrFailure}` });
    }

	window.showInformationMessage(`Draft Message - '${result}'`);
}

