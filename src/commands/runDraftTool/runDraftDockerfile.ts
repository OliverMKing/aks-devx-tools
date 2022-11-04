import {failed} from '../../utils/errorable';
import {getExtensionPath, longRunning} from '../../utils/host';
import {Context} from './model/context';
import * as vscode from 'vscode';
import {downloadDraftBinary} from './helper/runDraftHelper';
import {DraftLanguage, draftLanguages} from './helper/languages';
import {
   AzureWizard,
   AzureWizardExecuteStep,
   AzureWizardPromptStep,
   IActionContext
} from '@microsoft/vscode-azext-utils';

const title = 'Draft a Dockerfile from source code';
const ignoreFocusOut = true;

interface PromptContext {
   sourceCodeFolder: vscode.Uri;
   language: DraftLanguage;
   version: string;
   port: string;
}
type WizardContext = IActionContext & Partial<PromptContext>;
type IPromptStep = AzureWizardPromptStep<WizardContext>;
type IExecuteStep = AzureWizardExecuteStep<WizardContext>;

export async function runDraftDockerfile(
   {actionContext, extensionContext}: Context,
   sourceCodeFolder: vscode.Uri
) {
   const extensionPath = getExtensionPath();
   if (failed(extensionPath)) {
      vscode.window.showErrorMessage(extensionPath.error);
      return undefined;
   }

   // Ensure Draft Binary
   const downloadResult = await longRunning(`Downloading Draft.`, () =>
      downloadDraftBinary()
   );
   if (!downloadResult) {
      vscode.window.showErrorMessage('Failed to download Draft');
      return undefined;
   }

   const wizardContext: WizardContext = {
      ...actionContext,
      sourceCodeFolder
   };
   const promptSteps: IPromptStep[] = [
      new PromptSourceCodeFolder(),
      new PromptLanguage(),
      new PromptVersion(),
      new PromptPort(),
      new PromptDockerfileOverride()
   ];
   const executeSteps: IExecuteStep[] = [
      // build draft
      // open generated files
      // save to context
   ];
   const wizard = new AzureWizard(wizardContext, {
      title,
      promptSteps,
      executeSteps
   });
   await wizard.prompt();
}

class PromptSourceCodeFolder extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      wizardContext.sourceCodeFolder = (
         await wizardContext.ui.showOpenDialog({
            title,
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            stepName: 'Source Code Folder',
            openLabel: 'Choose Source Code Folder',
            defaultUri: wizardContext.sourceCodeFolder
         })
      )[0];

      // TODO: validate that source code folder is in workspace
      // what happens if folder isn't selected?
      // choose folder from right click if right clicked
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptLanguage extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      const languageToItem = (lang: DraftLanguage) => ({label: lang.name});
      const languageOptions: vscode.QuickPickItem[] =
         draftLanguages.map(languageToItem);
      const languagePick = await wizardContext.ui.showQuickPick(
         languageOptions,
         {
            ignoreFocusOut,
            title,
            stepName: 'Programming Language',
            placeHolder: 'Select the programming language'
         }
      );
      const language = draftLanguages.find(
         (lang) => languageToItem(lang).label === languagePick.label
      );
      if (language === undefined) {
         // this should never happen
         throw Error('No match for programming language');
      }

      wizardContext.language = language;
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptVersion extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      const language = wizardContext.language;
      if (language === undefined) {
         throw Error('Language is undefined');
      }

      const versionOptions: vscode.QuickPickItem[] = language.versions.map(
         (version) => ({label: version})
      );
      const versionPick = await wizardContext.ui.showQuickPick(versionOptions, {
         ignoreFocusOut,
         title,
         stepName: 'Version',
         placeHolder: `Select ${language.name} version`
      });
      wizardContext.version = versionPick.label;
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptPort extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      wizardContext.port = await wizardContext.ui.showInputBox({
         ignoreFocusOut,
         title,
         prompt: 'Port (e.g. 8080)',
         stepName: 'Port'
      });
   }

   public shouldPrompt(wizardContext: WizardContext): boolean {
      return true;
   }
}

class PromptDockerfileOverride extends AzureWizardPromptStep<WizardContext> {
   public async prompt(wizardContext: WizardContext): Promise<void> {
      await wizardContext.ui.showWarningMessage('Overriding file');
   }
   public shouldPrompt(wizardContext: WizardContext): boolean {
      // todo: only run if dockerfile will be overriden
      return true;
   }
}
