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
} from "@aws-sdk/client-ecr";
import { fromIni } from "@aws-sdk/credential-provider-ini";
import { fromEnv } from "@aws-sdk/credential-provider-env";

import cli from "./cli.helper";

function getCredentials() {
  if (process.env.AWS_PROFILE) {
    return fromIni();
  }
  return fromEnv();
}

function getEcrInstance(options: { region: string }) {
  return new ECRClient({
    credentials: getCredentials(),
    region: options.region,
  });
}

export async function ecrImageExists(options: {
  region: string;
  repositoryName: string;
  imageIds;
}) {
  const ecr = getEcrInstance({ region: options.region });
  try {
    const images = await ecr.send(
      new DescribeImagesCommand({
        repositoryName: options.repositoryName,
        imageIds: options.imageIds,
      })
    );

    if (process.env.VERBOSE) {
      cli.verbose(JSON.stringify(images.imageDetails));
    }
  } catch (e) {
    if (e.name === "ImageNotFoundException") {
      return false;
    }
    throw e;
  }
  return true;
}

export async function ecrGetDockerCredentials(options: { region: string }) {
  const ecr = getEcrInstance({ region: options.region });
  const auth = await ecr.send(new GetAuthorizationTokenCommand({}));
  let password;
  try {
    password = Buffer.from(
      auth.authorizationData[0].authorizationToken,
      "base64"
    )
      .toString("ascii")
      .split(":")[1];
  } catch (e) {
    throw new Error("Could not decode authorizationData");
  }
  return {
    password,
    username: "AWS",
    endpoint: auth.authorizationData[0].proxyEndpoint,
  };
}

function getECSInstance(options: { region: string }) {
  return new ECSClient({
    credentials: getCredentials(),
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
      })
    )
  ).taskDefinition;
  if (process.env.VERBOSE) {
    cli.verbose(JSON.stringify(taskDefinition));
  }
  return taskDefinition;
}

export async function ecsRegisterTaskDefinition(options: {
  region: string;
  taskDefinitionRequest: RegisterTaskDefinitionCommandInput;
}) {
  const ecs = getECSInstance({ region: options.region });
  const taskDefinition = (
    await ecs.send(
      new RegisterTaskDefinitionCommand(options.taskDefinitionRequest)
    )
  ).taskDefinition;
  if (process.env.VERBOSE) {
    cli.verbose(JSON.stringify(taskDefinition));
  }
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
      })
    )
  ).service;
  if (process.env.VERBOSE) {
    cli.verbose(JSON.stringify(service));
  }
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
      | { type: "deployment"; deployment: Deployment }
  ) => void
): { stop: () => void; promise: Promise<void> } {
  const ecs = getECSInstance({ region: options.region });
  const showOlder = options.showOlder === undefined ? 5 : options.showOlder;
  let lastEventDate: Date;

  // todo, events might be lost here, make a lastEventDate per source

  const getService = async () => {
    try {
      let passLastEventDate: Date;
      const services = await ecs.send(
        new DescribeServicesCommand({
          services: [options.service],
          cluster: options.cluster,
        })
      );

      callback({ type: "services", services: services.services });

      services.services.forEach((s) => {
        s.deployments.forEach((d) => {
          if (d.updatedAt > lastEventDate) {
            callback({ type: "deployment", deployment: d });
            if (!passLastEventDate || passLastEventDate < d.updatedAt) {
              passLastEventDate = d.updatedAt;
            }
          }
        });
        if (s.events.length > 0) {
          let events;
          // sort event, the oldest is first
          events = s.events.sort((x, y) =>
            x.createdAt > y.createdAt ? 1 : -1
          );
          if (lastEventDate) {
            events = s.events.filter((x) => x.createdAt > lastEventDate);
          } else {
            // show last n events
            events = showOlder ? events.slice(-showOlder) : [];
          }
          events.forEach((x) => {
            if (!passLastEventDate || passLastEventDate < x.createdAt) {
              passLastEventDate = x.createdAt;
            }
            callback({
              type: "message",
              message: x.message,
              createdAt: x.createdAt,
              source: s.serviceName,
            });
          });
        }
      });
      if (!lastEventDate || passLastEventDate > lastEventDate) {
        lastEventDate = passLastEventDate;
      }
    } catch (e) {
      stop();
      reject(e);
    }
  };

  let resolve, reject;
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
