import * as vscode from 'vscode';
import { longRunning } from './../../utils/host';
import { ensureDraftBinary } from './helper/runDraftHelper';

export default async function runDraftDeployment(
    _context: vscode.ExtensionContext,
    destination: string
): Promise<void> {
    const downloadResult = await longRunning(`Downloading Draft.`, () => ensureDraftBinary());
    if (!downloadResult) {
        return undefined;
    }

    // multiStepInput(_context, destination);
}