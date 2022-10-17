import * as vscode from "vscode";
import { Context, ContextApi } from "../../utils/context";
import * as semver from "semver";
import { KnownRunStatus, Run } from "@azure/arm-containerregistry";

export default async function runBuildContainer(
  _context: vscode.ExtensionContext
): Promise<void> {
  const ctx: ContextApi = new Context(_context);

  // ensure docker extension version is handled
  const version =
    semver.coerce(
      vscode.extensions.getExtension("ms-azuretools.vscode-docker")?.packageJSON
        .version
    ) || "";
  const required = "^1.23.0";
  if (!semver.satisfies(version, required)) {
    vscode.window.showErrorMessage(
      `Docker extension version ${required} needed`
    );
    return;
  }

  const { status, id, outputImages }: Run =
    await vscode.commands.executeCommand(
      "vscode-docker.registries.azure.buildImage"
    );
  if (
    status !== KnownRunStatus.Succeeded ||
    typeof outputImages === "undefined"
  ) {
    return;
  }

  // TODO: parse out subscription, resource group from id
  // id in form of /subscriptions/<subscription>/resourceGroups/<rg>/providers/Microsoft.ContainerRegistry/registries/<registry>/runs/cdh
  const subscription = "todo";
  const resourceGroup = "todo";
  const image = outputImages[0];
  const { registry, repository, tag } = image;

  ctx.setAcrName(registry as string);
  ctx.setAcrRepository(repository as string);
  ctx.setAcrTag(tag as string);
  ctx.setSubscription(subscription);
  ctx.setAcrResourceGroup(resourceGroup);

  vscode.window.showInformationMessage(
    "Build image succeeded",
    "Draft Kubernetes Deployment and Service"
  );
}
