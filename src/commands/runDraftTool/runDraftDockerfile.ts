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
    const resourceGroups: QuickPickItem[] = ['dockerfile-deployment', 'dockerfile', 'deployment']
		.map(label => ({ label }));
	const langugaesResources: QuickPickItem[] = ['clojure', 'c#', 'erlang', 'go', 'gomodule', "java", "gradle", "javascript", "php", "python", "rust", "swift"]
		.map(label => ({ label }));
    const deploymentTypes: QuickPickItem[] = ['helm', 'kustomize', 'manifests']
		.map(label => ({ label }));

	interface State {
		title: string;
		step: number;
		totalSteps: number;
		resourceGroup: QuickPickItem | string;
        fileType: QuickPickItem | string;
        language: string;
        portNumber: string;
		name: string;
        deploymentType: string;
		runtime: QuickPickItem;
	}

	async function collectInputs() {
		const state = {} as Partial<State>;
		await MultiStepInput.run(input => pickResourceGroup(input, state));
		return state as State;
	}

    const title = 'Draft Create Command';

	async function pickResourceGroup(input: MultiStepInput, state: Partial<State>) {
		const pick = await input.showQuickPick({
			title,
			step: 1,
			totalSteps: 5,
			placeholder: 'Pick a File Creation Type',
			items: resourceGroups,
			activeItem: typeof state.fileType !== 'string' ? state.fileType : undefined,
			shouldResume: shouldResume
		});
        state.fileType = pick.label;
		return (input: MultiStepInput) => pickResourceGroupLanguages(input, state);
    }

	async function pickResourceGroupLanguages(input: MultiStepInput, state: Partial<State>) {
		const pick = await input.showQuickPick({
			title,
			step: 2,
			totalSteps: 5,
			placeholder: 'Pick a language',
			items: langugaesResources,
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
			prompt: 'Port Number',
			validate: validateNameIsUnique,
			shouldResume: shouldResume
		});
        return (input: MultiStepInput) => inputApplicationName(input, state);
		// return (input: MultiStepInput) => inputName(input, state);
	}

	async function inputApplicationName(input: MultiStepInput, state: Partial<State>) {
		state.name = await input.showInputBox({
			title,
			step: 4,
			totalSteps: 5,
			value: typeof state.name === 'string' ? state.name : '',
			prompt: 'Application Name',
			validate: validateNameIsUnique,
			shouldResume: shouldResume
		});
		return (input: MultiStepInput) => pickDeploymentType(input, state);
	}

	async function inputName(input: MultiStepInput, state: Partial<State>) {
		const additionalSteps = typeof state.resourceGroup === 'string' ? 1 : 0;
		// TODO: Remember current value when navigating back.
		state.name = await input.showInputBox({
			title,
			step: 3 + additionalSteps,
			totalSteps: 3 + additionalSteps,
			value: state.name || '',
			prompt: 'Choose a unique name for the Application Service',
			validate: validateNameIsUnique,
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
		// Could show a notification with the option to resume.
		return new Promise<boolean>((resolve, reject) => {
			// noop
		});
	}

	async function validateNameIsUnique(name: string) {
		// ...validate...
		await new Promise(resolve => setTimeout(resolve, 1000));
		return name === 'vscode' ? 'Name not unique' : undefined;
	}

	async function getAvailableRuntimes(resourceGroup: QuickPickItem | string, token?: CancellationToken): Promise<QuickPickItem[]> {
		// ...retrieve...
		await new Promise(resolve => setTimeout(resolve, 1000));
		return ['Node 8.9', 'Node 6.11', 'Node 4.5']
			.map(label => ({ label }));
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

