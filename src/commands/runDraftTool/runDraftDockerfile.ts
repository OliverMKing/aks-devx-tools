import * as vscode from 'vscode';
import { getExtensionPath, longRunning } from './../../utils/host';
import { failed } from './../../utils/errorable';
import { downloadDraftBinary } from './helper/runDraftHelper';
import { QuickPickItem, window, CancellationToken, ExtensionContext } from 'vscode';
import { buildCreateCommand, buildCreateConfig } from './helper/draftCommandBuilder';
import { runDraftCommand } from './helper/runDraftHelper';
import { reporter } from './../../utils/reporter';
import { MultiStepInput } from './model/stepInput';


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
		name: string;
        deploymentType: string;
		runtime: QuickPickItem;
	}

	async function collectInputs() {
		const state = {} as Partial<State>;
		await MultiStepInput.run(input => selectLanguage(input, state));
		return state as State;
	}

	async function selectLanguage(input: MultiStepInput, state: Partial<State>) {
		const pick = await input.showQuickPick({
			title,
			step: 2,
			totalSteps: 5,
			placeholder: 'Select the programming language',
			items: languages,
			activeItem: typeof state.language !== 'string' ? state.language : undefined,
			shouldResume: shouldResume
		});
		state.language = pick.label;
        return (input: MultiStepInput) => inputPortNumber(input, state);
	}

    async function inputPortNumber(input: MultiStepInput, state: Partial<State>) {
		state.portNumber = await input.showInputBox({
			title,
			step: 3,
			totalSteps: 5,
			value: typeof state.portNumber === 'string' ? state.portNumber : '',
			prompt: 'Port (e.g.8080)',
			validate: validatePort,
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => inputApplicationName(input, state);
	}

	async function inputApplicationName(input: MultiStepInput, state: Partial<State>) {
		state.name = await input.showInputBox({
			title,
			step: 4,
			totalSteps: 5,
			value: typeof state.name === 'string' ? state.name : '',
			prompt: 'Application Name',
			validate: validatePort,
			shouldResume: shouldResume
		});
		return (input: MultiStepInput) => pickDeploymentType(input, state);
	}

    async function pickDeploymentType(input: MultiStepInput, state: Partial<State>) {
		const pick = await input.showQuickPick({
			title,
			step: 5,
			totalSteps: 5,
			placeholder: 'Pick a deployment type',
			items: deploymentTypes,
			activeItem: typeof state.deploymentType !== 'string' ? state.deploymentType : undefined,
			shouldResume: shouldResume
		});
        state.deploymentType = pick.label;
	}

	function shouldResume() {
		return new Promise<boolean>((resolve, reject) => {
			// noop
		});
	}

	async function validatePort(port: string) {
        // wait before validating so users don't see error messages while typing 
		await new Promise(resolve => setTimeout(resolve, 500));

        const portNum = parseInt(port);
        const portMin = 1;
        const portMax = 65535;
        const portErr = `Port must be in range ${portMin} to ${portMax}`;

        if (portNum < portMin) return portErr;
        if (portNum > portMax) return portErr

        return undefined;
	}

	const state = await collectInputs();

    const language = state.language;
    const fileType = state.fileType;
    const port = state.portNumber;
    const appName = state.name;
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

