import * as vscode from "vscode";
import { longRunning } from "./../../utils/host";
import { QuickPickItem, window, ExtensionContext } from "vscode";
import { reporter } from "./../../utils/reporter";
import {
  MultiStepInput,
  validationSleep,
  shouldResume,
} from "./model/multiStep";
import * as fs from "fs";
import * as path from "path";
import linguist = require("linguist-js");
import { Exception, template } from "handlebars";

const wsPath = vscode.workspace.workspaceFolders![0].uri.fsPath;

const githubFolderName = ".github";
const workflowsFolderName = "workflows";
const workflowPath = path.join(wsPath, githubFolderName, workflowsFolderName);

const helmWorkflowType = "Helm";
const kubeWorkflowType = "Kube";
const basicDeploymentStrategy = "Basic";
const canaryDeploymentStrategy = "Canary";
const bgDeploymentStrategy = "Blue/green";

const templateDir = path.join(".", "resources");
const bgcFilename = "bc_c_template.yaml";
const basicFilename = "basic_template.yaml";

const containerRegistryPlaceholder = "your-azure-container-registry";
const containerImagePlaceholder = "your-container-image-name";
const rgPlaceholder = "your-resource-group";
const clusterPlaceholder = "your-cluster-name";
const manifestPathPlaceholder = "your-deployment-manifest-path";
const deploymentStrategyPlaceholder = "your-deployment-strategy";
const branchPlaceholder = "your-branch-name";

export default async function runCreateWorkflow(
  _context: vscode.ExtensionContext,
  destination: string
): Promise<void> {
  // init - create workflows folder if it doesn't already exist

  if (
    !fs.existsSync(workflowPath) ||
    !fs.lstatSync(workflowPath).isDirectory()
  ) {
    fs.mkdirSync(workflowPath, { recursive: true });
  }

  multiStepInput(_context, destination);
}

async function multiStepInput(context: ExtensionContext, destination: string) {
  const title = "Generate Github Actions workflow";

  interface State {
    resourceGroup: string;
    aksClusterName: string;
    containerRegistry: string;
    containerImageName: string;
    deploymentStrategy: string;
    branch: string;
    manifestsLocation: string;
    workflowType: string;
  }

  async function collectInputs() {
    const state = { sourceFolder: destination } as Partial<State>;
    await MultiStepInput.run((input) => selectResourceGroup(input, state, 1));
    return state as State;
  }

  const totalSteps = 8;

  // @ts-ignore recursive function
  async function selectResourceGroup(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    const rgList = getResourceGroups();
    const items: QuickPickItem[] = rgList.map((label) => ({ label }));

    const pick = await input.showQuickPick({
      title,
      step: step,
      totalSteps: totalSteps,
      placeholder: "Select Azure Resource Group",
      items: items,
      activeItem:
        typeof state.resourceGroup !== "string"
          ? state.resourceGroup
          : undefined,
      shouldResume: shouldResume,
    });

    state.resourceGroup = pick.label;

    return (input: MultiStepInput) => selectAksCluster(input, state, step + 1);
  }

  // @ts-ignore recursive function
  async function selectAksCluster(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    const clusterList = getAKSClusters();
    const items: QuickPickItem[] = clusterList.map((label) => ({ label }));

    const pick = await input.showQuickPick({
      title,
      step: step,
      totalSteps: totalSteps,
      placeholder: "Select Azure Kubernetes Service (AKS) cluster",
      items: items,
      activeItem:
        typeof state.aksClusterName !== "string"
          ? state.aksClusterName
          : undefined,
      shouldResume: shouldResume,
    });

    state.aksClusterName = pick.label;

    return (input: MultiStepInput) => selectAcrRegistry(input, state, step + 1);
  }

  // @ts-ignore recursive function
  async function selectAcrRegistry(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    const registryList = getContainerRegistries();
    const items: QuickPickItem[] = registryList.map((label) => ({ label }));

    const pick = await input.showQuickPick({
      title,
      step: step,
      totalSteps: totalSteps,
      placeholder: "Select Azure Container Registry",
      items: items,
      activeItem:
        typeof state.aksClusterName !== "string"
          ? state.aksClusterName
          : undefined,
      shouldResume: shouldResume,
    });

    state.aksClusterName = pick.label;

    return (input: MultiStepInput) =>
      inputContainerImageName(input, state, step + 1);
  }

  async function inputContainerImageName(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.containerImageName = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value:
        typeof state.containerImageName === "string"
          ? state.containerImageName
          : "",
      prompt: "Container image name",
      validate: async (imageName: string) => {
        await validationSleep();
        const imgNameErr =
          "Invalid container image name. Must be lowercase alphanumeric";
        const lowercaseErr = "Invalid container image name. Must be lowercase";
        if (imageName === "") {
          return imgNameErr;
        }
        if (imageName.toLowerCase() !== imageName) {
          return lowercaseErr;
        }
        if (!/^[a-z0-9]+$/gi.test(imageName)) {
          return imgNameErr;
        }

        return undefined;
      },
      shouldResume: shouldResume,
    });
    return (input: MultiStepInput) => selectStrategy(input, state, step + 1);
  }

  // @ts-ignore recursive function
  async function selectStrategy(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    const strategies = [
      basicDeploymentStrategy,
      canaryDeploymentStrategy,
      bgDeploymentStrategy,
    ];
    const items: QuickPickItem[] = strategies.map((label) => ({ label }));

    const pick = await input.showQuickPick({
      title,
      step: step,
      totalSteps: totalSteps,
      placeholder: "Strategy",
      items: items,
      activeItem:
        typeof state.deploymentStrategy !== "string"
          ? state.deploymentStrategy
          : undefined,
      shouldResume: shouldResume,
    });

    state.deploymentStrategy = pick.label;

    return (input: MultiStepInput) => inputBranch(input, state, step + 1);
  }

  async function inputBranch(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.branch = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value: typeof state.branch === "string" ? state.branch : "",
      prompt: "GitHub branch (e.g. main)",
      validate: async (branch: string) => {
        await validationSleep();
        const branchNameErr = "GitHub branch name must not be blank";
        if (branch === "") return branchNameErr;

        return undefined;
      },
      shouldResume: shouldResume,
    });

    return (input: MultiStepInput) =>
      inputManifestsLocation(input, state, step + 1);
  }

  async function inputManifestsLocation(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    state.manifestsLocation = await input.showInputBox({
      title,
      step: step,
      totalSteps: totalSteps,
      value:
        typeof state.manifestsLocation === "string"
          ? state.manifestsLocation
          : "",
      prompt: "Folder with your deployment manifests (e.g. src/manifests)",
      validate: async (file: string) => {
        await validationSleep();
        const errMsg = "Input must be an existing directory";
        const fullWsPath = path.join(wsPath, file);
        if (!fs.existsSync(fullWsPath)) return errMsg;
        if (!fs.lstatSync(fullWsPath).isDirectory()) return errMsg;

        return undefined;
      },
      shouldResume: shouldResume,
    });
    return (input: MultiStepInput) =>
      selectWorkflowType(input, state, step + 1);
  }

  // @ts-ignore recursive function
  async function selectWorkflowType(
    input: MultiStepInput,
    state: Partial<State>,
    step: number
  ) {
    const workflowTypes = [kubeWorkflowType, helmWorkflowType];
    const items: QuickPickItem[] = workflowTypes.map((label) => ({ label }));

    const pick = await input.showQuickPick({
      title,
      step: step,
      totalSteps: totalSteps,
      placeholder: "Workflow type",
      items: items,
      activeItem:
        typeof state.workflowType !== "string" ? state.workflowType : undefined,
      shouldResume: shouldResume,
    });

    state.workflowType = pick.label;
  }

  try {
    if (!vscode.workspace.workspaceFolders) {
      throw new Error(
        "unable to locate Workspace file system, please ensure you have your project open in VS Code"
      );
    }
    const state = await collectInputs();
    const resourceGroup = state.resourceGroup;
    const aksClusterName = state.aksClusterName;
    const containerRegistry = state.containerRegistry;
    const containerImageName = state.containerImageName;
    const deploymentStrategy = state.deploymentStrategy;
    const branch = state.branch;
    const manifestsLocation = state.manifestsLocation;
    const workflowType = state.workflowType;

    var templateFile;

    if (workflowType === helmWorkflowType) {
      // handle accordingly
    } else {
      console.log(
        `currently at ${__dirname} and have files ${fs.readdirSync(__dirname)}`
      );
      if (
        deploymentStrategy === canaryDeploymentStrategy ||
        deploymentStrategy === bgDeploymentStrategy
      ) {
        templateFile = bgcFilename;
      } else {
        templateFile = basicFilename;
      }
      templateFile = path.join(templateDir, templateFile);
      const fileString = fs.readFileSync(templateFile).toString("utf-8");
      const withValues = fileString
        .replace(rgPlaceholder, resourceGroup)
        .replace(clusterPlaceholder, aksClusterName)
        .replace(containerRegistryPlaceholder, containerRegistry)
        .replace(containerImagePlaceholder, containerImageName)
        .replace(manifestPathPlaceholder, manifestsLocation)
        .replace(deploymentStrategyPlaceholder, deploymentStrategy)
        .replace(branchPlaceholder, branch);

      const outputFilename = containerImageName + "_" + deploymentStrategy;
      const outputFilepath = path.join(workflowPath, outputFilename);

      fs.writeFileSync(outputFilepath, withValues);

      reporter.sendTelemetryEvent("generateworkflowResult", {
        generateworkflowResult: `${true}`,
      });

      window.showInformationMessage(
        `Generate Github Actions workflow succeeded - output to '${outputFilepath}'`
      );
    }
  } catch (err) {
    reporter.sendTelemetryEvent("generateworkflowResult", {
      generateworkflowResult: `${err}`,
    });
    window.showInformationMessage(`Encountered error: '${err}'`);
  }
}

function getResourceGroups(): string[] {
  return ["resourceGroup1", "resourceGroup2", "resourceGroup3"];
}

function getAKSClusters(): string[] {
  return ["cluster1", "cluster2", "cluster3"];
}

function getContainerRegistries(): string[] {
  return ["registry1", "registry2", "registry3"];
}
