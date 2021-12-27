import * as AWS from "aws-sdk";
import { SharedIniFileCredentials, ECR, ECS } from "aws-sdk";
import cli from "./cli.helper";

function getCredentials() {
  if (!!process.env.AWS_PROFILE) {
    return new SharedIniFileCredentials({
      profile: process.env.AWS_PROFILE,
    });
  } else {
    return new AWS.Credentials({
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
  try {
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
  } catch (e) {
    throw e;
  }
}

export async function ecsRegisterTaskDefinition(options: {
  region: string;
  taskDefinitionRequest: ECS.Types.RegisterTaskDefinitionRequest;
}) {
  const ecs = getECSInstance({ region: options.region });
  try {
    const taskDefinition = (
      await ecs.registerTaskDefinition(options.taskDefinitionRequest).promise()
    ).taskDefinition;
    if (process.env.VERBOSE) {
      cli.verbose(JSON.stringify(taskDefinition));
    }
    return taskDefinition;
  } catch (e) {
    throw e;
  }
}

export async function ecsUpdateService(options: {
  region: string;
  cluster: string;
  service: string;
  taskDefinition: string;
}) {
  const ecs = getECSInstance({ region: options.region });
  try {
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
  } catch (e) {
    throw e;
  }
}
