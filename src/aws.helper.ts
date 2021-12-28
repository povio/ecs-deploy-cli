import { SharedIniFileCredentials, Credentials, ECR, ECS } from "aws-sdk";
import cli from "./cli.helper";

function getCredentials() {
  if (!!process.env.AWS_PROFILE) {
    return new SharedIniFileCredentials({
      profile: process.env.AWS_PROFILE,
    });
  } else {
    return new Credentials({
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
    });
  }
}

function getEcrInstance(options: { region: string }) {
  return new ECR({
    credentials: getCredentials(),
    region: options.region,
  });
}

export async function ecrImageExists(options: {
  region: string;
  repositoryName: string;
  imageIds: ECR.ImageIdentifierList;
}) {
  const ecr = getEcrInstance({ region: options.region });
  try {
    const images = await ecr
      .describeImages({
        repositoryName: options.repositoryName,
        imageIds: options.imageIds,
      })
      .promise();
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
  const auth = (await ecr.getAuthorizationToken().promise())
    .authorizationData[0];
  let password;
  try {
    password = Buffer.from(auth.authorizationToken, "base64")
      .toString("ascii")
      .split(":")[1];
  } catch (e) {
    throw new Error("Could not decode authorizationData");
  }
  return {
    password,
    username: "AWS",
    endpoint: auth.proxyEndpoint,
  };
}

function getECSInstance(options: { region: string }) {
  return new ECS({
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
    await ecs
      .describeTaskDefinition({
        taskDefinition: options.taskDefinition,
      })
      .promise()
  ).taskDefinition;
  if (process.env.VERBOSE) {
    cli.verbose(JSON.stringify(taskDefinition));
  }
  return taskDefinition;
}

export type RegisterTaskDefinitionRequest =
  ECS.Types.RegisterTaskDefinitionRequest;

export async function ecsRegisterTaskDefinition(options: {
  region: string;
  taskDefinitionRequest: RegisterTaskDefinitionRequest;
}) {
  const ecs = getECSInstance({ region: options.region });

  const taskDefinition = (
    await ecs.registerTaskDefinition(options.taskDefinitionRequest).promise()
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
    await ecs
      .updateService({
        cluster: options.cluster,
        service: options.service,
        taskDefinition: options.taskDefinition,
      })
      .promise()
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
      | { type: "services"; services: ECS.Types.Services }
      | { type: "deployment"; deployment: ECS.Types.Deployment }
  ) => void
): { stop: () => void; promise: Promise<void> } {
  const ecs = getECSInstance({ region: options.region });
  const showOlder = options.showOlder === undefined ? 5 : options.showOlder;
  let lastEventDate: Date;

  // todo, events might be lost here, make a lastEventDate per source

  const getService = async () => {
    try {
      let passLastEventDate: Date;
      const services = await ecs
        .describeServices({
          services: [options.service],
          cluster: options.cluster,
        })
        .promise();

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
