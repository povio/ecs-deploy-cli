import merge from "lodash.merge";
import {
  ECSClient,
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand,
  RegisterTaskDefinitionCommandInput,
  UpdateServiceCommand,
  DescribeServicesCommand,
  Service,
  Deployment,
} from "@aws-sdk/client-ecs";
import {
  ECRClient,
  DescribeImagesCommand,
  GetAuthorizationTokenCommand,
  ImageIdentifier,
  ImageDetail,
} from "@aws-sdk/client-ecr";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { logVariable, logVerbose } from "./cli.helper";
import {
  GetParameterCommand,
  GetParametersByPathCommand,
  GetParametersCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";

function getCredentials(options: { region: string }) {
  return fromNodeProviderChain({
    //...any input of fromEnv(), fromSSO(), fromTokenFile(), fromIni(),
    // fromProcess(), fromInstanceMetadata(), fromContainerMetadata()
    // Optional. Custom STS client configurations overriding the default ones.
    clientConfig: { region: options.region },
  });
}

export async function getAwsIdentity(options: { region: string }) {
  const stsClient = new STSClient({
    credentials: getCredentials(options),
    region: options.region,
  });
  return await stsClient.send(new GetCallerIdentityCommand({}));
}

function getEcrInstance(options: { region: string }) {
  return new ECRClient({
    credentials: getCredentials(options),
    region: options.region,
  });
}

export async function ecrImageExists(options: {
  region: string;
  repositoryName: string;
  imageIds: ImageIdentifier[];
}) {
  const ecr = getEcrInstance({ region: options.region });
  try {
    const images = await ecr.send(
      new DescribeImagesCommand({
        repositoryName: options.repositoryName,
        imageIds: options.imageIds,
      }),
    );
    logVerbose(JSON.stringify(images.imageDetails));
  } catch (e: any) {
    if (e?.name === "ImageNotFoundException") {
      return false;
    }
    throw e;
  }
  return true;
}

export async function ecrGetLatestImageTag(options: {
  region: string;
  repositoryName: string;
}) {
  const ecr = getEcrInstance({ region: options.region });
  try {
    const images = (
      await ecr.send(
        new DescribeImagesCommand({
          repositoryName: options.repositoryName,
        }),
      )
    ).imageDetails as ImageDetail[];
    images.sort((a, b) => {
      if (!b.imagePushedAt || !a.imagePushedAt) return 0;
      return (b.imagePushedAt || 0) < (a.imagePushedAt || 0) ? -1 : 1;
    });
    return images[0].imageTags?.[0];
  } catch (e: any) {
    if (e.name === "ImageNotFoundException") {
      return false;
    }
    throw e;
  }
}

export async function ecrGetDockerCredentials(options: { region: string }) {
  const ecr = getEcrInstance({ region: options.region });
  const auth = await ecr.send(new GetAuthorizationTokenCommand({}));
  const authorizationToken = auth?.authorizationData?.[0].authorizationToken;
  const proxyEndpoint = auth?.authorizationData?.[0].proxyEndpoint;
  if (!authorizationToken || !proxyEndpoint) {
    throw new Error("Could not get auth token or proxy");
  }
  let password;
  try {
    password = Buffer.from(authorizationToken, "base64")
      .toString("ascii")
      .split(":")[1];
  } catch (e) {
    throw new Error("Could not decode authorizationData");
  }
  return {
    password,
    username: "AWS",
    endpoint: proxyEndpoint,
  };
}

function getECSInstance(options: { region: string }) {
  return new ECSClient({
    credentials: getCredentials(options),
    region: options.region,
  });
}

export async function ecsGetCurrentTaskDefinition(options: {
  taskDefinition: string;
  region: string;
}) {
  const ecs = getECSInstance({ region: options.region });
  const taskDefinition = (
    await ecs.send(
      new DescribeTaskDefinitionCommand({
        taskDefinition: options.taskDefinition,
      }),
    )
  ).taskDefinition;
  logVerbose(JSON.stringify(taskDefinition));
  return taskDefinition;
}

export async function ecsRegisterTaskDefinition(options: {
  region: string;
  taskDefinitionRequest: RegisterTaskDefinitionCommandInput;
}) {
  const ecs = getECSInstance({ region: options.region });
  const taskDefinition = (
    await ecs.send(
      new RegisterTaskDefinitionCommand(options.taskDefinitionRequest),
    )
  ).taskDefinition;
  logVerbose(JSON.stringify(taskDefinition));
  return taskDefinition;
}

export async function ecsUpdateService(options: {
  region: string;
  cluster: string;
  service: string;
  taskDefinition: string;
}) {
  const ecs = getECSInstance({ region: options.region });
  const service = (
    await ecs.send(
      new UpdateServiceCommand({
        cluster: options.cluster,
        service: options.service,
        taskDefinition: options.taskDefinition,
      }),
    )
  ).service;
  logVerbose(JSON.stringify(service));
  return service;
}

/**
 * Periodically check ECS Service and Cluster for new messages
 * @param options
 * @param callback
 */
export function ecsWatch(
  options: {
    region: string;
    cluster: string;
    service: string;
    delay?: number;
    showOlder?: number;
  },
  callback: (
    message:
      | {
          type: "message";
          source?: string;
          message: string;
          createdAt: Date;
        }
      | { type: "services"; services: Service[] }
      | { type: "deployment"; deployment: Deployment },
  ) => void,
): { stop: () => void; promise: Promise<void> } {
  const ecs = getECSInstance({ region: options.region });
  const showOlder = options.showOlder === undefined ? 5 : options.showOlder;
  let lastEventDate: Date | undefined = undefined;

  // todo, events might be lost here, make a lastEventDate per source

  let resolve: () => void;
  let reject: (e: any) => void;

  const getService = async () => {
    try {
      let passLastEventDate: Date | undefined = undefined;
      const services = await ecs.send(
        new DescribeServicesCommand({
          services: [options.service],
          cluster: options.cluster,
        }),
      );

      if (!services.services) {
        throw new Error("Expected services but got none");
      }

      callback({ type: "services", services: services.services });

      services.services.forEach((s) => {
        if (s.deployments) {
          s.deployments.forEach((d) => {
            if ((d.updatedAt || 0) > (lastEventDate || 0)) {
              callback({ type: "deployment", deployment: d });
              if (
                d.updatedAt &&
                (!passLastEventDate || passLastEventDate < d.updatedAt)
              ) {
                passLastEventDate = d.updatedAt;
              }
            }
          });
        }

        if (s.events && s.events.length > 0) {
          let events;
          // sort event, the oldest is first
          events = s.events.sort((x, y) =>
            (x.createdAt || 0) > (y.createdAt || 0) ? 1 : -1,
          );
          if (lastEventDate) {
            events = s.events.filter(
              (x) => (x.createdAt || 0) > (lastEventDate || 0),
            );
          } else {
            // show last n events
            events = showOlder ? events.slice(-showOlder) : [];
          }
          events.forEach((x) => {
            if (
              x.createdAt &&
              (!passLastEventDate || passLastEventDate < x.createdAt)
            ) {
              passLastEventDate = x.createdAt;
            }
            callback({
              type: "message",
              message: x.message || "",
              createdAt: x.createdAt || new Date(),
              source: s.serviceName,
            });
          });
        }
      });
      if (
        !lastEventDate ||
        (passLastEventDate || new Date(0)) > lastEventDate
      ) {
        lastEventDate = passLastEventDate;
      }
    } catch (e) {
      stop();
      reject(e);
    }
  };

  const promise: Promise<void> = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const stop = () => {
    clearInterval(interval);
    resolve();
  };

  const interval = setInterval(getService, (options.delay || 15) * 1000);
  getService().then();
  return {
    stop,
    promise,
  };
}

const SSMRegEx =
  /arn:aws:ssm:(?<region>[^:]+)?:(?<accountId>\d+)?:parameter\/(?<path>.*)/;

export function resolveSecretPath(options: {
  accountId: string;
  region: string;
  arn: string;
}) {
  if (!options.arn.startsWith("arn:aws:ssm:")) {
    // todo check secret manager
    return options.arn;
  }
  const match = options.arn.match(SSMRegEx);
  if (!match?.groups?.path) {
    throw new Error("Could not parse parameter arn");
  }
  return `arn:aws:ssm:${match.groups.region || options.region}:${
    match.groups.accountId || options.accountId
  }:parameter/${match.groups.path}`;
}

export function getSSMInstance(options: { region: string }) {
  return new SSMClient({
    credentials: getCredentials(options),
    region: options.region,
  });
}

export async function getSSMParameter(options: {
  region: string;
  name: string;
}) {
  const match = options.name.match(SSMRegEx);
  if (!match?.groups?.path) {
    throw new Error("Could not parse parameter arn");
  }

  const ssm = getSSMInstance({ region: options.region });
  const response = await ssm.send(
    new GetParameterCommand({
      Name: `/${match.groups.path}`,
      WithDecryption: true,
    }),
  );
  if (!response.Parameter?.Value) {
    throw new Error("Could not get parameter");
  }
  return response.Parameter.Value;
}

export async function getSSMParametersByPath(options: {
  region: string;
  path: string;
}) {
  const ssm = getSSMInstance({ region: options.region });

  let parameters = {};
  let nextToken: string | undefined = undefined;
  do {
    const response = await ssm.send(
      new GetParametersByPathCommand({
        Path: options.path,
        WithDecryption: true,
        Recursive: true,
        NextToken: nextToken,
        MaxResults: 50,
      }),
    );
    parameters = merge(parameters, response.Parameters);

    // consume all parameters
    nextToken = response.NextToken;
  } while (nextToken);

  return parameters;
}
